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

const clearEl = (el) => {
    while (el.lastChild) {
        el.removeChild(el.lastChild)
    }
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

const newCodeTag = (codeText, codeLang, highlighted = true) => {
    let pre = document.createElement("pre");
    pre.classList.add("mb-0", "lh-1");    
    let code = document.createElement("code");
    pre.appendChild(code);
    code.classList.add("language-" + codeLang, "p-0");
    code.innerHTML = codeText;
    if (highlighted) { hljs.highlightElement(code); } else { code.classList.add("d-inline-block")}
    return pre
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
    if (fetchOpsCount <= 0) {
        fetchOpsCount = 0;
        hideInform = true;
        after(300, () => { if (hideInform) inform() }); //hide toast
    }
}

const fetchAPI = async (url, method="GET", data=null, progressMsg="loading...", hide404 = false) => {
    let statusText = "";
    try {
        let authKey = getAuthKey();
        if (!authKey) return;        
        fetchOpsCount++;
        inform(progressMsg, true);
        const body = !!data ? JSON.stringify(data) : null;
        console.log(`${method} ${url}`, data)
        const resp = await fetch(url, {
            method,
            headers: {
                "x-functions-key": authKey,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body
        })
        if (resp.status == 404 && hide404) {
            decFetchOps();
            return {};
        }
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

async function refreshDash() {
    await selectTab(activeTab);
}

//UI dash renderers 

function defaultRenderer (table, dataList, template, renderOne) {
    clearEl(table);
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
            let codeEl = newCodeTag(data[p], codeLang, getCategory(codeLang) == "programming")
            div.appendChild(codeEl);
        }
        target.appendChild(div)
    })
}

const showModal = (id) => bootstrap.Modal.getOrCreateInstance("#" + id).show();

const hideModal = (id) => bootstrap.Modal.getOrCreateInstance("#" + id).hide();

let currentFragments = {}

function dropFragment(event) {
    event.preventDefault();
    // Get the id of the target and add the moved element to the target's DOM
    const fragmentIdStr = event.dataTransfer.getData("text/plain");
    const fragment = currentFragments[fragmentIdStr];
    fragment.el.focus({preventScroll:true})
    // event.target.appendChild(fragment.el);
    // console.log(fragment.el.innerText)
}

const elIndex = (el) => [...el.parentElement.children].indexOf(el)

const findFragEl = (el, i = 0) => {
    if (el == null) return null;
    if (i == 10) return null;
    if (el.classList.contains("fragment")) return el;
    return findFragEl(el.parentElement, i+1);
}

// const elBin = (el) => ["fragments", "trashed"].find(bin => el.parentElement.classList.contains(bin)) || "";

function dragoverFragment(event) {
    event.preventDefault();
    const fragmentIdStr = event.dataTransfer.getData("text/plain");
    const fragment = currentFragments[fragmentIdStr];
    const bellowEl = findFragEl(event.target);
    if (bellowEl != null && fragment.el != bellowEl) {
        // console.log(fragment.el.innerText, "||", bellowEl.innerText)
        // const curBin = elBin(fragment.el)
        // const otherBin = elBin(bellowEl)
        // if (!curBin || !otherBin) return;
        // if (curBin == otherBin) { //same bin 
        let curIndex = elIndex(fragment.el);
        let otherIndex = elIndex(bellowEl);
        if (curIndex < otherIndex) bellowEl.after(fragment.el);
        else if (curIndex > otherIndex) bellowEl.before(fragment.el);
        // fragment.el.focus({preventScroll:true})
        // } else if (curBin == "fragments") {   
        //     bellowEl.before(fragment.el);
        // } else if (curBin == "trashed") {
        //     bellowEl.after(fragment.el);
        // }
    }    
    // event.dataTransfer.dropEffect = "move"
}

let emptyImg = document.createElement('img')
emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

//https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle
//https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
function shuffle(array) {
    let currentIndex = array.length;
    // While there remain elements to shuffle.
    while (currentIndex > 0) {
      // Pick a remaining element.
      let randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      // And swap it with the current element.
      [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

function shuffleFragments() {
    const fragModalEl = document.getElementById("fragments-modal")
    const bin = fragModalEl.querySelector(".fragments")
    fragments = shuffle([...bin.querySelectorAll(".fragment")])
    fragments.forEach(frEl => bin.appendChild(frEl));
}

async function approvePuzzle(event) {
    const { url, id, domain } = event.target.dataset;
    const fragModalEl = document.getElementById("fragments-modal")
    const task = fragModalEl.querySelector(".puzzle-task").innerText
    const fragments = []
    const distractors = [];
    let curList = fragments;
    [...fragModalEl.querySelectorAll(".fragment")].forEach(frEl => {
        if (frEl.classList.contains("delim")) curList = distractors;
        else {
            curList.push(frEl.innerText);
        }        
    })
    let shuffled = fragModalEl.querySelector(".puzzle-shuffle").checked;
    let enabled = fragModalEl.querySelector(".puzzle-enabled").checked;
    const { id:createdId } = await fetchAPI(url + "/" + id, "POST", { domain, task, fragments, distractors, shuffled, enabled }) || {}
    if (createdId) {
        hideModal("fragments-modal")
        await refreshDash();
    }
}

async function initParsonsModal({ id, task = "Sort fragments in correct order. Trash wrong fragments.", 
                    fragments = [], distractors = [], domain = "", noTrash = false, shuffled = false, enabled = true, replace = false }) {    
    let parsonsModalEl = document.getElementById("fragments-modal")     
    const saveBtlEl = parsonsModalEl.querySelector(".save-puzzle")
    saveBtlEl.dataset.id = id
    saveBtlEl.dataset.domain = domain
    //first fetch existign puzzle if any     
    if (!replace) {
        let res = await fetchAPI(saveBtlEl.dataset.url + "/" + id, "GET", null, "loading puzzle...", true) || {}
        task = res.task;
        fragments = res.fragments;
        distractors = res.distractors;
        shuffled = res.shuffled;
        enabled = res.enabled;
        noTrash = res.noTrash;
    }
    parsonsModalEl.querySelector(".puzzle-task").innerHTML = task 
    parsonsModalEl.querySelector(".puzzle-shuffle").checked = shuffled
    parsonsModalEl.querySelector(".puzzle-enabled").checked = enabled
    currentFragments = {}           
    let fragmentId = 0
    const bins = {".fragments": noTrash ? fragments.map(f => ({f})) : [
        ...fragments.map(f => ({f})),
        {f:"Drag incorrect fragments below this one", cls:["border-secondary", "fw-bold", "text-white", "bg-secondary", "mb-0", "lh-1", "delim"], noCode:true},
        ...distractors.map(f => ({f}))
    ]}
    Object.keys(bins).forEach(bin => {
        const binEl = parsonsModalEl.querySelector(bin);
        clearEl(binEl) 
        bins[bin].forEach(({f, cls = [], noCode = false}, i) => {
            let codeEl = null; 
            if (noCode) {
                codeEl = document.createElement("pre")
                codeEl.innerHTML = f;
            } else {
                codeEl = newCodeTag(f, domain, getCategory(domain) == "programming");
            }                
            codeEl.classList.add("border", "fragment", "px-2", "py-2", ...cls)

            codeEl.draggable = true
            codeEl.tabIndex = 0;
            codeEl.lastChild.tabIndex = -1;
            let fragmentIdStr = `${fragmentId}`
            currentFragments[fragmentIdStr] = {pos:i, bin:".fragments", el:codeEl}
            codeEl.addEventListener("click", (ev) => {
                codeEl.focus({preventScroll:true, focusVisible:true})
            })
            codeEl.addEventListener("keyup", (ev) => {
                if ((ev.code == "ArrowUp") && codeEl.previousElementSibling) {
                    codeEl.previousElementSibling.before(codeEl)
                } else if ((ev.code == "ArrowDown") && codeEl.nextElementSibling) {
                    codeEl.nextElementSibling.after(codeEl)
                }
                codeEl.focus({preventScroll:true})
            })
            codeEl.addEventListener("dragstart", (ev) => {
                // ev.target.classList.add("border-primary")
                codeEl.focus({preventScroll:true})
                ev.dataTransfer.setData("text/plain", fragmentIdStr)
                ev.dataTransfer.effectAllowed = "move";
                ev.dataTransfer.setDragImage(emptyImg, 0, 0)
            })
            codeEl.addEventListener("dragend", (ev) => {
                // ev.target.classList.remove("border-primary")
            })

            binEl.appendChild(codeEl)
            fragmentId++;
        })    
    })
}

function getProgrammingData(formEl) {
    const data = {};
    [...formEl.querySelectorAll(".gen-ex-field")].forEach(el => {
        const fieldName = [...el.classList].find(cl => cl.startsWith("ex-")).substring(3)
        data[fieldName] = el.innerText;
    });   
    return data; 
}

function getHistoryData(formEl) {
    const data = {};
    data["task"] = formEl.querySelector(".ev-task").innerText;
    data["events"] = [];
    [...formEl.querySelectorAll(".ev-holder")].forEach(evData => {
        let date = evData.querySelector(".ev-date").innerText
        let event = evData.querySelector(".ev-ev").innerText
        let link = evData.querySelector(".ev-link").innerText
        data["events"].push({ date, event, link });
    })
    return data;     
}

async function saveGenerated(event) {
    event.preventDefault(); //do not actually submit
    const { id, category, modalId } = event.currentTarget.dataset
    const dataGetters = {"programming":getProgrammingData, "history":getHistoryData}
    const data = dataGetters[category](event.currentTarget);
    const { validation: {validated_ts, is_valid, error, test} = {}, fragmentation: {fragments = [], distractors = [], noTrash = false} = {}, settings: { domain } = {}, gen = {} } = 
        await fetchAPI(event.currentTarget.action + "/" + id + "/" + category, 
            "PUT", data, "validating...") || {}
    if (!validated_ts) return;    
    await refreshDash();
    inform(is_valid ? "Exercise is valid" : `${error} ${test}`, false, [is_valid ? "text-success" : "text-danger", "fw-bold"])
    //open modal for fragments shuffling - later other functionality
    if (is_valid) {        
        await initParsonsModal({ id, task: gen.task, fragments, distractors, domain, noTrash, replace: true });
        hideModal(modalId);
        await sleep(200);
        showModal("fragments-modal")
    }
}

function prefillProgrammingModal(domain, modalEl, detailsObj) {
    Object.keys(detailsObj).forEach(k => {
        let el = modalEl.querySelector(`.ex-${k}`);
        if (el) {el.innerHTML = detailsObj[k]}
        else { console.log("missing element for property ", k)}
    });
    const form = modalEl.querySelector("form");
    [...form.querySelectorAll(".gen-code")].forEach(el => {
        el.lastChild.classList.add(`language-${domain}`)
        hljs.highlightElement(el.lastChild);
    });            
    return form;
}

function editable_pre(txt, cls = []) {
    let preel = document.createElement("pre")
    preel.innerHTML = txt 
    preel.contentEditable = true; 
    preel.classList.add("mb-0",...cls)
    return preel;
}

function prefillHistoryModal(domain, modalEl, { events = [] }) {
    const form = modalEl.querySelector("form");
    let evel = form.querySelector(".gen-ex-events")
    events.forEach(({ date, event, link}) => {
        let divel = document.createElement("div")
        divel.classList.add("ev-holder", "mb-3", "small")
        divel.appendChild(editable_pre(date, ["ev-date","fw-bold", 'me-2']))
        divel.appendChild(editable_pre(event, ["ev-ev","txt-secondary", "me-2"]))
        divel.appendChild(editable_pre(link, ["ev-link","txt-info", 'me-2']))
        evel.appendChild(divel)
    })
    return form;
}

function render_exercises(dataList) {    
    const exerciseTableEl = document.getElementById("exercise-table")
    const exerciseRowEl = document.getElementById("exercise-row")
    defaultRenderer(exerciseTableEl, dataList, exerciseRowEl, (row, { id, creation_ts, update_ts,
            status, settings: { domain, topic, form, level, numErrors, complexity, avoid } = {},
            gen = {}, validation = {}, stats: { skipped = 0, solved = 0, moves = 0, error = 0 } = {}, 
            fragmentation: { fragments = [], distractors = [] } = {},
            puzzle: {enabled} = { }
        }) => {
        let statusToCls = { "approved": "text-success", "raw": "text-secondary-emphasis", "error": "text-danger-emphasis", "validated": "text-info"}
        props_to_div(row.querySelector(".exercise-status"), {status}, false, ["text-uppercase", "fw-bold", statusToCls[status] || "" ])        
        props_to_div(row.querySelector(".exercise-status"), {"updated":dtToStr(update_ts), "created":dtToStr(creation_ts)}, true, ["small"]);
        props_to_div(row.querySelector(".exercise-domain"), {domain}, false)
        props_to_div(row.querySelector(".exercise-domain"), {topic}, false, ["small"])
        // props_to_div(row.querySelector(".exercise-settings"), { form, level, numErrors, complexity, avoid: avoid.length == 0 ? null : avoid}, true, ["small"]);
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
                
                const { validated_ts, error, message, test, tests_passed } = validation
                const valEl = row.querySelector(".exercise-validation")

                if (validated_ts) {
                    props_to_div(valEl, { "":error || "Valid" }, false, [!error ? "text-success" : "text-danger"])
                    if (message) props_to_div(valEl, { message }, false, ["small"])
                    if (test) props_to_div(valEl, { test }, false, ["small"], domain)
                    if (tests_passed) props_to_div(valEl, { "tests passed": tests_passed }, true, ["small"])
                    // props_to_div(valEl, { "":dtToStr(validated_ts) }, false, ["small"])
                } else {
                    props_to_div(valEl, {});
                }

                break;
            }
            case "history": {
                const { events = [], untrue = []  } = gen
                let genEl = document.createElement("div")
                genEl.style.maxHeight = "20ex";
                genEl.style.overflowY = "auto";
                row.querySelector(".exercise-gen").appendChild(genEl);
                events.forEach(({ date, event, link }) => {
                    let el = document.createElement("div")
                    let dateEl = document.createElement("span")
                    dateEl.classList.add("me-2")
                    dateEl.innerHTML = date 
                    let eventEl = document.createElement("a")
                    eventEl.setAttribute("target", "_blank")
                    eventEl.classList.add("link-secondary")
                    eventEl.innerHTML = event 
                    eventEl.href=link;
                    el.appendChild(dateEl)
                    el.appendChild(eventEl)
                    genEl.appendChild(el);
                })
                
                const { validated_ts, error, message } = validation
                const valEl = row.querySelector(".exercise-validation")

                if (validated_ts) {
                    props_to_div(valEl, { "":error || "Valid" }, false, [!error ? "text-success" : "text-danger"])
                    if (message) props_to_div(valEl, { message }, false, ["small"])
                } else {
                    props_to_div(valEl, {});
                }
                break;
            }
            case "chain": {
                const { task, premises = [], untrue = [], conclusions =[]  } = gen
                let genEl = document.createElement("div")
                genEl.style.maxHeight = "10ex";
                genEl.style.overflowY = "auto";
                row.querySelector(".exercise-gen").appendChild(genEl);
                props_to_div(genEl, {"":"premises:"}, false);
                premises.forEach(({ premise, rel }) => {
                    let el = document.createElement("div")
                    let el1 = document.createElement("span")
                    el1.classList.add("me-2", "text-secondary")
                    el1.innerHTML = premise;
                    let el2 = document.createElement("span")
                    el2.innerHTML = rel;
                    el.appendChild(el1)
                    el.appendChild(el2)
                    genEl.appendChild(el);
                })
                props_to_div(genEl, {"":"conclusions:"}, false);
                conclusions.forEach(({ fact, rel }) => {
                    let el = document.createElement("div")
                    let el1 = document.createElement("span")
                    el1.classList.add("me-2", "text-success")
                    el1.innerHTML = fact;
                    let el2 = document.createElement("span")
                    el2.innerHTML = rel;
                    el.appendChild(el1)
                    el.appendChild(el2)
                    genEl.appendChild(el);
                })
                
                const valEl = row.querySelector(".exercise-validation")
                props_to_div(valEl, {});

                break;
            }
            default: {
                props_to_div(row.querySelector(".exercise-gen"), gen)
                break;
            }
        }        
        let statsEl = row.querySelector(".exercise-stats")
        if (typeof enabled != "undefined") {
            props_to_div(statsEl, {"puzzle": enabled ? "visible" : "hidden"}, true, ["small", enabled ? "text-success" : "text-danger"])
            let stts = {moves, solved, skipped, errors: error}
            if (Object.keys(stts).some(k => !!stts[k])) props_to_div(statsEl, stts, true, ["small"])
        } else {
            props_to_div(statsEl, {})
        }
        const detailsEl = row.querySelector(".exercise-details")
        const removeActions = (...acts) => {
            acts.forEach(a => detailsEl.querySelector(`[value=${a}]`).remove())
        }
        const actionsToRemove = {"raw": ["validate_ex"]}
        removeActions(...(actionsToRemove[status] || []))
        detailsEl.addEventListener("change", async (e) => {
            e.preventDefault();
            switch (detailsEl.value) {
                case "gen_ex": {
                    const modalId = `${category}-modal`;                    
                    const modalEl = document.getElementById(modalId);
                    let prefill = {"programming": prefillProgrammingModal, "history": prefillHistoryModal}
                    let form = prefill[category](domain, modalEl, gen)
                    form.dataset.id = id;
                    form.dataset.category = category;
                    showModal(modalId);
                    break;
                }
                case "validate_ex": {
                    await initParsonsModal({ id, task: gen.task, fragments, distractors, domain })
                    showModal("fragments-modal")
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
        props_to_div(row.querySelector(".op-status"), {"# exercises": num}, true, ["small"]);
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
        let logel = row.querySelector(".op-log");
        if (success > 0) props_to_div(logel, {success}, true, ["text-success", "fw-bold"])
        if (fail > 0) props_to_div(logel, {fail}, true, ["text-danger", "fw-bold"])
        if (waiting > 0) props_to_div(logel, {waiting}, true, ["text-info", "fw-bold"])

        const detailsEl = row.querySelector(".op-details")
        detailsEl.addEventListener("change", async (e) => {
            e.preventDefault();
            switch (detailsEl.value) {
                case "details_op": {
                    let modalEl = document.getElementById("op-modal");
                    detailsObj = {id, status, time: datetime, duration, domain, topic, form, level, numErrors, complexity, 
                                    avoid: avoid.length == 0 ? "--none--" : avoid.join(", "), num}
                    Object.keys(detailsObj).forEach(k => {
                        let el = modalEl.querySelector("." + k);
                        if (el) {el.innerHTML = detailsObj[k]}
                        else { console.log("missing element for property ", k)}
                    });
                    showModal("op-modal")
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

function render_sessions(dataList) {
    const sessionTableEl = document.getElementById("session-table")
    const sessionRowEl = document.getElementById("session-row")        
    defaultRenderer(sessionTableEl, dataList, sessionRowEl, (row, { 
            start_ts, end_ts = null, domain, solved = 0, skipped = 0, error = 0, moves = 0
        }) => {
        [start_date, start_time] = dtToStr(start_ts, true).split(" ")
        let datetime = "";
        if (!end_ts) {
            datetime = `${start_date} ${start_time} → now`    
        } else {
            [end_date, end_time] = dtToStr(end_ts, true).split(" ")
            if (start_date == end_date) {
                datetime = `${start_date} ${start_time} → ${end_time}`    
            } else {
                datetime = `${start_date} ${start_time} → ${end_date} ${end_time}`
            }
        }
        
        props_to_div(row.querySelector(".session-time"), {datetime}, false);
        props_to_div(row.querySelector(".session-domain"), {domain}, false)
        props_to_div(row.querySelector(".session-solved"), {solved:`${solved}`}, false)
        props_to_div(row.querySelector(".session-skipped"), {solved:`${skipped}`}, false)
        props_to_div(row.querySelector(".session-error"), {solved:`${error}`}, false)
        props_to_div(row.querySelector(".session-moves"), {solved:`${moves}`}, false)
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
    decFetchOps();
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
        await sleep(5000, (slp) => { logsSleep = slp });
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
        clearEl(targetEl)
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

    modalEl.addEventListener("hide.bs.modal", () => { cancelLogsOp(); refreshDash() })
    modalEl.addEventListener("shown.bs.modal", () => { 
        clearEl(document.getElementById("creation-log"))
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