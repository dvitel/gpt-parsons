//global UI elements 
let apiKeyEl = null; //API key UI element for auth backend requests
let messageToastEl = null; //error/info messages in form of toast
let activeTab = null; //active UI dash

//utils section start
const dtToStr = (dt, withDate = false) => {
    if (!dt) return;
    let now = new Date()
    let start = new Date(dt * 1000)
    let sameDay = now.getDate() == start.getDate()
    let timePart = [start.getHours(), start.getMinutes(), start.getSeconds()].map(s => (s < 10 ? "0" : "") + s).join(":")
    let prefix = timePart;
    if (!sameDay || withDate) {
        let datePart = [start.getMonth(), start.getDate()].map(s => (s < 10 ? "0" : "") + s).join("/")
        prefix = datePart + " " + timePart;
    }
    return prefix;
}

const sleep = (ms, wakeupReg = () => {}) => {
    let resolveRes = null;
    let res = new Promise(resolve => resolveRes = resolve)
    wakeupReg(resolveRes);
    setTimeout(() => {
        resolveRes();
    }, ms)
    return res 
}

const after = async (ms, f) => {
    await sleep(ms);
    f();
}

let toastPrevStyling = {}

let hideInform = false;

const inform = (txt, withProgress = false, cls = []) => {   
    hideInform = false;
    const messageToastBootstrap = bootstrap.Toast.getOrCreateInstance(messageToastEl, {autohide: !withProgress, delay:withProgress ? 30000 : 10000})   
    if (!txt) {
        messageToastBootstrap.hide();
        return;
    }
    let textEl = messageToastEl.querySelector(".toast-text");
    let progressEl = messageToastEl.querySelector(".toast-progress");
    if (withProgress) {
        const el = messageToastEl.querySelector(".progress-bar");         
        el.innerHTML = txt;
        textEl.classList.add("d-none");
        progressEl.classList.remove("d-none");
        progressEl.classList.add(...cls);
    } else {        
        textEl.innerHTML = txt;
        textEl.classList.remove("d-none");
        textEl.classList.add(...cls);
        progressEl.classList.add("d-none");
    }
    if (toastPrevStyling.cls) {
        if (toastPrevStyling.withProgress) {
            progressEl.classList.remove(...toastPrevStyling.cls)
        } else {
            textEl.classList.remove(...toastPrevStyling.cls)
        }
    }
    toastPrevStyling.withProgress = withProgress;
    toastPrevStyling.cls = cls;    
    if (!messageToastBootstrap.isShown()) messageToastBootstrap.show() 
}

//UI init section
function onKeyChange(e) {
    if (e) e.preventDefault();
    apiKeyEl.classList.remove("is-invalid")        
    selectTab(activeTab)
}    

function getAuthKey() {
    const authKey = apiKeyEl.value;   
    if (!authKey) {
        apiKeyEl.classList.add("is-invalid")
        inform("API key is required", false, ["text-danger", "fw-bold"]);
    }
    return authKey;
}

let fetchOpsCount = 0;
const decFetchOps = () => {
    fetchOpsCount--;    
    if (fetchOpsCount == 0) {
        hideInform = true;
        after(300, () => { if (hideInform) inform() }); //hide toast
    } else if (fetchOpsCount < 0) {
        fetchOpsCount = 0;
    }
}

const fetchAPI = async (url, method="GET", data=null, progressMsg="loading...") => {
    let statusText = "";
    try {
        let authKey = getAuthKey();
        if (!authKey) return;        
        fetchOpsCount++;
        inform(progressMsg, true);
        const body = !!data ? JSON.stringify(data) : null;
        console.log(`${method} ${url} ${data}...`)
        const resp = await fetch(url, {
            method,
            headers: {
                "x-functions-key": authKey,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body
        })
        statusText = `Status ${resp.status} ${resp.statusText}`;
        const respData = await resp.json() || {};       
        console.log(`Response ${method} ${url} ${resp.status}`, respData);
        if (resp.ok && respData.ok) {
            decFetchOps();
            return respData.data
        } else {
            let errorMessage = `Fail response from service ${resp.status} ${JSON.stringify(respData)}`;
            if (respData.error) errorMessage = `${respData.error} ${respData.message}`;
            throw new Error(errorMessage);
        }
    } catch (e) {        
        fetchOpsCount--;
        let message = e.message;
        if (e instanceof SyntaxError) message = statusText;
        console.error(`Error`, message);
        inform(message, false, ["text-danger", "fw-bold"])
    }

}

const selectTab = async tab => {
    activeTab = tab;
    const resultData = await fetchAPI(tab.dataset.url, "GET") || [];
    let resultRenderer = window[tab.dataset.renderer] ||((data) => console.log(`Missing render function ${tab.dataset.renderer}`, data));
    resultRenderer(resultData);
}

function refreshDash() {
    selectTab(activeTab);
}

//UI dash renderers 

function defaultRenderer (table, dataList, template, renderOne) {
    while (table.lastChild) { //clear dash table
        table.removeChild(table.lastChild)
    }        
    if (!dataList || dataList.length == 0) {
        const row = template.content.lastChild.cloneNode(true)
        let td = document.createElement("td");
        td.classList.add("text-center");
        td.setAttribute("colspan", `${row.children.length}`);              
        let span = document.createElement("span")
        span.innerHTML = "No entities found for specified query"
        td.appendChild(span)
        row.innerHTML = td.outerHTML;
        table.appendChild(row)
    } else {
        dataList.forEach(d => {
            const row = template.content.lastChild.cloneNode(true)
            renderOne(row, d)
            table.appendChild(row)
        })
    }
}

const text_to_div = (target, text) => {
    let div = document.createElement("div")
    div.innerHTML = text
    target.appendChild(div)
}   

// generic method of rendering json props
const props_to_div = (target, data, withHeader = true, cls = [], codeLang = "") => {
    const keys = Object.keys(data).filter(k => !!data[k]);
    if (keys.length == 0) {
        text_to_div(target, "--absent--")
        return;
    }
    keys.forEach(p => {
        let div = document.createElement("div")
        if (!codeLang) {            
            div.innerHTML = ((withHeader && p) ? (p + ": ") : "") + ((typeof data[p] == "string") ? data[p] : JSON.stringify(data[p]))
            div.classList.add(...cls);            
        } else {
            if (withHeader) {
                let headerDiv = document.createElement("div")
                headerDiv.innerHTML = p;
                div.appendChild(headerDiv);
            }
            let pre = document.createElement("pre");
            pre.classList.add("mb-0");
            div.appendChild(pre);
            let code = document.createElement("code");
            pre.appendChild(code);
            code.classList.add("language-" + codeLang);
            code.innerHTML = data[p];
            hljs.highlightElement(code);
        }
        target.appendChild(div)
    })
}

async function saveGenerated(event) {
    event.preventDefault(); //do not actually submit
    const data = new FormData(event.currentTarget);
    const plainFormData = Object.fromEntries(data.entries());
    const { validation: {validated_ts, is_valid} = {}, fragmentation: {fragments = [], distractors = []} = {}, settings: { domain } = {} } = 
        await fetchAPI(event.currentTarget.action + "/" + event.currentTarget.dataset.id + "/" + event.currentTarget.dataset.category, 
            "PUT", plainFormData, "validating...") || {}
    if (!validated_ts) return;
    inform(is_valid ? "Generated data is valid" : "Invalid content from ChatGPT", false, [is_valid ? "text-success" : "text-danger", "fw-bold"])
    refreshDash();
    //open modal for fragments shuffling - later other functionality
    if (is_valid) {
        let parsonsModal = bootstrap.Modal.getOrCreateInstance("#fragments-modal")
        let parsonsModalEl = document.getElementById("fragments-modal")
        const frEl = parsonsModalEl.querySelector("fragments");
        fragments.forEach(f => {
            const preEl = document.createElement("pre")
            const codeEl = document.createElement("code")
            preEl.classList.add("mb-0")
            preEl.classList.add("border-1")
            preEl.appendChild(codeEl)
            codeEl.innerHTML = f; 
            codeEl.classList.add("language-" + codeLang);
            hljs.highlightElement(codeEl)
            frEl.appendChild(preEl)
        })
        const trEl = parsonsModalEl.querySelector("trashed");
        distractors.forEach(f => {
            const preEl = document.createElement("pre")
            const codeEl = document.createElement("code")
            preEl.classList.add("mb-0")
            preEl.classList.add("border-1")
            preEl.appendChild(codeEl)
            codeEl.innerHTML = f; 
            codeEl.classList.add("language-" + codeLang);
            hljs.highlightElement(codeEl)
            trEl.appendChild(preEl)
        })
        parsonsModal.show();
    }
}

function render_exercises(dataList) {    
    const exerciseTableEl = document.getElementById("exercise-table")
    const exerciseRowEl = document.getElementById("exercise-row")
    defaultRenderer(exerciseTableEl, dataList, exerciseRowEl, (row, { id, creation_ts, update_ts,
            status, settings: { domain, topic, form, level, numErrors, complexity, avoid } = {},
            gen = {}, validation = {}, stats = {}
        }) => {
        let statusToCls = { "approved": "text-success", "raw": "text-secondary-emphasis", "error": "text-danger-emphasis", "validated": "text-info", "disabled":"text-secondary"}
        props_to_div(row.querySelector(".exercise-status"), {status}, false, ["text-uppercase", "fw-bold", statusToCls[status] || "" ])        
        props_to_div(row.querySelector(".exercise-status"), {"updated":dtToStr(update_ts), "created":dtToStr(creation_ts)});
        props_to_div(row.querySelector(".exercise-domain"), {domain}, false)
        props_to_div(row.querySelector(".exercise-domain"), {topic}, false, ["small"])
        props_to_div(row.querySelector(".exercise-settings"), { form, level, numErrors, complexity, avoid: avoid.length == 0 ? null : avoid}, true, ["small"]);
        let category = getCategory(domain)
        switch (category) {
            case "programming": {
                const { task, code, explain, incorrect, tests } = gen
                let genEl = document.createElement("div")
                genEl.style.maxHeight = "20ex";
                genEl.style.overflowY = "auto";
                row.querySelector(".exercise-gen").appendChild(genEl);
                props_to_div(genEl, { task }, false, ["mb-1"])
                props_to_div(genEl, { code }, false, [], domain)
                // props_to_div(row.querySelector(".exercise-gen"), { tests }, true, [], domain)
                break;
            }
            case "history": {
                break;
            }
            case "chain": {
                break;
            }
            default: {
                props_to_div(row.querySelector(".exercise-gen"), gen)
                break;
            }
        }        
        props_to_div(row.querySelector(".exercise-validation"), validation)
        props_to_div(row.querySelector(".exercise-stats"), stats)
        const detailsEl = row.querySelector(".exercise-details")
        const removeActions = (...acts) => {
            acts.forEach(a => detailsEl.querySelector(`[value=${a}]`).remove())
        }
        const actionsToRemove = {"raw": ["disable_ex", "enable_ex", "validate_ex"], "error": ["disable_ex", "enable_ex"], 
                                 "validated": [ "disable_ex", "enable_ex" ], "approved": ["enable_ex"], "disabled": ["disable_ex"]}
        removeActions(...actionsToRemove[status])
        detailsEl.addEventListener("change", async (e) => {
            e.preventDefault();
            switch (detailsEl.value) {
                case "gen_ex": {
                    const modalId = `${category}-modal`;
                    const modal = bootstrap.Modal.getOrCreateInstance("#" + modalId);
                    const modalEl = document.getElementById(modalId);
                    detailsObj = gen
                    Object.keys(detailsObj).forEach(k => {
                        let el = modalEl.querySelector(`[name=${k}]`);
                        if (el) {el.value = detailsObj[k]}
                        else { console.log("missing element for property ", k)}
                    });
                    const form = modalEl.querySelector("form")
                    form.dataset.id = id;
                    form.dataset.category = category;
                    modal.show();
                    break;
                }
                case "delete_ex": {
                    if (confirm("Are you sure you want to delete the exercise permanently?")) {
                        let data = await fetchAPI(detailsEl.dataset.updateUrl + "/" + id, "DELETE") || {};
                        if (data.deleted) await selectTab(activeTab); //refresh tab
                    }                    
                    break;
                }
                default: break;
            }
            detailsEl.value = "";
        })
    })
}

function render_ops (dataList) {
    const opTableEl = document.getElementById("op-table")
    const opRowEl = document.getElementById("op-row")        
    defaultRenderer(opTableEl, dataList, opRowEl, (row, { id, start_ts, end_ts, 
            status, settings:{domain, topic, form, level, numErrors, complexity, avoid, num=1} = {},
            log = []
        }) => {
        [start_date, start_time] = dtToStr(start_ts, true).split(" ")
        let datetime = "";
        let duration = "";
        if (!end_ts) {
            datetime = `${start_date} ${start_time} → now`    
            duration = Math.round(Date.now() / 1000 - start_ts) + "s"
        } else {
            [end_date, end_time] = dtToStr(end_ts, true).split(" ")
            if (start_date == end_date) {
                datetime = `${start_date} ${start_time} → ${end_time}`    
            } else {
                datetime = `${start_date} ${start_time} → ${end_date} ${end_time}`
            }
            duration = (end_ts - start_ts) + "s"
        }
        
        props_to_div(row.querySelector(".op-time"), {datetime}, false);
        props_to_div(row.querySelector(".op-time"), {duration}, true, ["small"]);
        let statusToCls = { "active": "text-info", "done": "text-success", "error": "text-danger"}
        props_to_div(row.querySelector(".op-status"), {status}, false, ["text-uppercase", statusToCls[status] || "" ])
        props_to_div(row.querySelector(".op-status"), {"# exercises": num == 1 ? null: num}, true, ["small"]);
        props_to_div(row.querySelector(".op-domain"), {domain}, false)
        props_to_div(row.querySelector(".op-domain"), {topic}, false, ["small"])
        props_to_div(row.querySelector(".op-settings"), { form, level, numErrors, complexity, avoid: avoid.length == 0 ? null : avoid}, true, ["small"])

        let success = 0;
        let fail = 0;        
        (log || []).forEach(({error, exercise_id}) => {
            if (!!error) fail++;
            else if (exercise_id) success++;
        })
        let waiting = num - success - fail;
        if (waiting < 0) waiting = 0;
        props_to_div(row.querySelector(".op-log"), { success, fail, waiting })

        const detailsEl = row.querySelector(".op-details")
        detailsEl.addEventListener("change", async (e) => {
            e.preventDefault();
            switch (detailsEl.value) {
                case "details_op": {
                    const modal = bootstrap.Modal.getOrCreateInstance("#op-modal");
                    let modalEl = document.getElementById("op-modal");
                    detailsObj = {id, status, time: datetime, duration, domain, topic, form, level, numErrors, complexity, 
                                    avoid: avoid.length == 0 ? "--none--" : avoid.join(", "), num}
                    Object.keys(detailsObj).forEach(k => {
                        let el = modalEl.querySelector("." + k);
                        if (el) {el.innerHTML = detailsObj[k]}
                        else { console.log("missing element for property ", k)}
                    });
                    modal.show();
                    renderLogs(modalEl.querySelector(".creation-log"), id); //do not await
                    document.getElementById("op-modal").addEventListener("hide.bs.modal", () => { cancelLogsOp() });
                    break;
                }
                // case "finalize_op": {
                //     if (confirm("Finalizing operation will mark it as done and cancel further AI requests. Do you want to continue?")) {
                //         let data = await fetchAPI(detailsEl.dataset.updateUrl + "/" + id, "PUT", { status: "done" }) || {};
                //         if (data.id) await selectTab(activeTab); //refresh tab
                //     }
                //     break;
                // }
                case "delete_op": {
                    if (confirm("Are you sure you want to delete the operation permanently?")) {
                        let data = await fetchAPI(detailsEl.dataset.updateUrl + "/" + id, "DELETE") || {};
                        if (data.deleted) await selectTab(activeTab); //refresh tab
                    }                    
                    break;
                }
                default: break;
            }
            detailsEl.value = "";
        })
    })
}

const fetchLogs = async (url, addLog, clearLogs, logsMessage) => {
    const { start_ts, end_ts, status, settings, error, log } = await fetchAPI(url, "GET", null, logsMessage) || {};
    if (!start_ts) return;
    clearLogs();
    let startPrefix = dtToStr(start_ts);
    const settingsStr = Object.keys(settings).map(k => `${k}=${settings[k]}`).join(" ");
    addLog(`${startPrefix} Generating exercises with settings: ${settingsStr}`);
    if (error) {
        addLog(`Error: ${error}`, ["text-danger"]);
    } else {
        (log || []).forEach(({i_start_ts, i_end_ts, message, error, exercise_id}, i) => {                                                        
            if (i_end_ts) {
                let iEndPrefix = dtToStr(i_end_ts); 
                let dur = i_end_ts - i_start_ts
                if (error) { addLog(`${iEndPrefix}\t[${i+1}/${settings.num}] error ${error}: ${message}`, ["text-danger", "ms-1"]) }
                else { addLog(`${iEndPrefix}\t[${i+1}/${settings.num}] new exercise in ${dur}s: ${exercise_id}`, ["ms-1"]) }
            } else {
                let iStartPrefix = dtToStr(i_start_ts); 
                addLog(`${iStartPrefix}\t[${i+1}/${settings.num}] started...`, ["ms-1"])
            }
        })
    }                    
    if (end_ts) {
        let endPrefix = dtToStr(end_ts);
        addLog(`${endPrefix} Finished with status ${status}`);
    }
    return status;
}
 
let logsOpId = null; //id of operation for which to fetch the logs
let logsSleep = null;
const cancelLogsOp = () => {
    logsOpId = null;
    if (logsSleep) {
        logsSleep();
        logsSleep = null;
    }
}
const fetchLogsLoop = async (baseUrl, opId, addLog, clearLogs, logsMessage) => {
    fetchOpsCount++;
    logsOpId = opId
    while((opId == logsOpId) && (await fetchLogs(baseUrl + opId, addLog, clearLogs, logsMessage) == "active")) {
        await sleep(4000, (slp) => { logsSleep = slp });
        logsSleep = null;
    }
    decFetchOps();
}

async function renderLogs(targetEl, opId, logsMessage = "loading logs...") {
    const addLog = (txt, cls = []) => {
        const el = document.createElement("div")
        el.innerHTML = txt;
        el.classList.add(...cls);
        targetEl.appendChild(el);
    }
    const clearLogs = () => {
        while (targetEl.lastChild) {
            targetEl.removeChild(targetEl.lastChild);
        }
        addLog("Fetching operation logs...")
    }    
    await fetchLogsLoop(targetEl.dataset.url, opId, addLog, clearLogs, logsMessage);
}

const getCategory = (domain) => {
    const languages = {"python":true}        
    if (languages[domain]) return "programming";
    return domain;
}

let creationInProgress = false;
function exerciseCreationInit() {
    const modalEl = document.getElementById('create-modal');
    const createExercisesForm = document.getElementById("create-exercises-form")
    let domainEl = document.getElementById('domain');    
    let logsEl = document.getElementById("creation-log")
    const onDomainChange = () => {
        let category = getCategory(domainEl.value);
        document.querySelectorAll("[data-programming-placeholder]")
            .forEach(el => {
                let pl = el.dataset[`${category}Placeholder`];
                el.setAttribute("placeholder", pl);
            })
    }

    domainEl.addEventListener("change", onDomainChange)
    onDomainChange();

    createExercisesForm.addEventListener("submit", async (event) => {
        if (creationInProgress) return;
        creationInProgress = true;        
        event.preventDefault(); //do not actually submit
        modalEl.querySelector("[type=submit]").disabled = true;
        const data = new FormData(event.currentTarget);
        data.delete("key"); 
        const plainFormData = Object.fromEntries(data.entries());
        ['num','complexity','numErrors'].forEach(prop => {
            plainFormData[prop] = parseInt(plainFormData[prop])
        })
        const { id } = await fetchAPI(createExercisesForm.action, createExercisesForm.method, plainFormData, "init exercise creation...") || {}
        if (!id) return;
        inform("AI gen started. Check operation logs...", false)
        await renderLogs(logsEl, id, "generating with ChatGPT...");
    })

    modalEl.addEventListener("hide.bs.modal", () => { cancelLogsOp() })
    modalEl.addEventListener("hidden.bs.modal", () => { refreshDash() })
    modalEl.addEventListener("shown.bs.modal", () => { 
        modalEl.querySelector("[type=submit]").disabled = false;
        creationInProgress = false;
    })
}

document.addEventListener("DOMContentLoaded", async () => {
    apiKeyEl = document.getElementById("key")    
    messageToastEl = document.getElementById('message')
     
    const tabEls = document.querySelectorAll('button[data-bs-toggle="tab"]')
    tabEls.forEach(tabEl => tabEl.addEventListener('shown.bs.tab', () => selectTab(tabEl)))
    selectTab(tabEls[0])

    exerciseCreationInit();
})