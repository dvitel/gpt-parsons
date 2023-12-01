document.addEventListener("DOMContentLoaded", () => {
    const createExercisesForm = document.getElementById("create-exercises-form")
    const progress = document.getElementById("progress")
    const error = document.getElementById("error")
    const success = document.getElementById("success")
    const key = document.getElementById("key")
    const log = document.getElementById("log")
    const domain = document.getElementById('domain')
    const exerciseRow = document.getElementById("exercise-row")
    const exerciseTable = document.getElementById("exercise-table")    
    const opRow = document.getElementById("op-row")
    const opTable = document.getElementById("op-table")
    let activeTab = null;

    const messageToast = document.getElementById('message')
    const messageToastBootstrap = bootstrap.Toast.getOrCreateInstance(messageToast)

    const dtToStr = (dt, withDate = false) => {
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

    const sendMessage = (txt, cls, removeCls) => {
        messageToast.classList.remove(removeCls)
        messageToast.classList.add(cls)
        messageToast.querySelector(".toast-body").innerHTML = txt;        
        messageToastBootstrap.show()      
    }

    // sendMessage("testing", "text-bg-danger", "text-bg-danger")
    // sendMessage("testing", "text-bg-primary", "text-bg-danger")

    const props_to_div = (target, data, withHeader, ...props) => {
        props.forEach(p => {
            if (!data[p]) return;
            let div = document.createElement("div")
            div.innerHTML = ((withHeader && p) ? (p + ": ") : "") + ((typeof data[p] == "string") ? data[p] : JSON.stringify(data[p]))
            target.appendChild(div)
        })
    }

    const text_to_div = (target, text) => {
        let div = document.createElement("div")
        div.innerHTML = text
        target.appendChild(div)
    }    

    const defaultRenderer = (table, template, data, renderOne) => {        
        while (table.lastChild) {
            table.removeChild(table.lastChild)
        }        
        if (!data || data.length == 0) {
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
            data.forEach(d => {
                const row = template.content.lastChild.cloneNode(true)
                renderOne(row, d)
                table.appendChild(row)
            })
        }                    
    }

    let renderers = {
        "renderer_exercises": (data) => defaultRenderer(exerciseTable, exerciseRow, data, (row, d) => {
            props_to_div(row.querySelector(".exercise-domain"), d, true, "domain","creation_ts")
            props_to_div(row.querySelector(".exercise-settings"), d, true, "topic","form","level","numErrors","complexity","avoid")
            let genEl = row.querySelector(".exercise-gen")
            if (d.gen) {                
                props_to_div(genEl, d, true, ...Object.keys(d.gen))
            } else {
                text_to_div(genEl, "--Absent--")
            }
            let validationEl = row.querySelector(".exercise-validation")
            if (d.validation) {
                keys = [...Object.keys(d.validation)]
                props_to_div(validationEl, d, true, ...keys)
                let cls = "";
                let status = d.validation.status
                if (status == "valid") {cls = "text-success";}
                else if (status == "invalid") {cls = "text-danger"}
                validationEl.classList.add(cls);
            } else if (d.gen) {
                text_to_div(validationEl, "Need validation")
                validationEl.classList.add("fw-bold")
            }
            let statsEl = row.querySelector(".exercise-stats")
            if (d.stats) {
                props_to_div(statsEl, d, true, ...Object.keys(d.stats))
            }
            let actionEl = row.querySelector(".exercise-details")
            actionEl.dataset.id = d.id
        }),
        "renderer_ops": (data) => defaultRenderer(opTable, opRow, data, (row, d) => {
            [start_date, start_time] = dtToStr(d.start_ts, true).split(" ")
            if (!d.end_ts) {
                d[""] = `${start_date} ${start_time} → now`    
            } else {
                [end_date, end_time] = dtToStr(d.end_ts, true).split(" ")
                if (start_date == end_date) {
                    d[""] = `${start_date} ${start_time} → ${end_time}`    
                } else {
                    d[""] = `${start_date} ${start_time} → ${end_date} ${end_time}`
                }
            }
            d.duration = (d.end_ts - d.start_ts) + "s"
            props_to_div(row.querySelector(".op-time"), d, true, "","duration")
            props_to_div(row.querySelector(".op-domain"), d, true, "domain","topic")
            props_to_div(row.querySelector(".op-settings"), d, true, "form","level","numErrors","complexity","avoid")

            let success = 0;
            let fail = 0;
            if (d.logs) {
                d.logs.forEach(l => {
                    if (!!l.error) fail += 1;
                    else success += 1;
                })
            }
            d.success = success;
            d.fail = fail;
            props_to_div(row.querySelector(".op-log"), d, true, "success", "fail")
        })
    }
    const tabEls = document.querySelectorAll('button[data-bs-toggle="tab"]')
    const selectTab = async tab => {
        activeTab = tab;
        const authKey = key.value;   
        let resultData = null;
        let resultRenderer = (data) => console.log(data);
        const renderer = tab.dataset.renderer
        if (renderer && renderers[renderer]) { 
            resultRenderer = renderers[renderer]
        }
        if (!authKey) {
            key.classList.add("is-invalid")
            sendMessage("Cannot fetch data. API key is required!", "text-bg-danger", "text-bg-primary")
        } else {
            const url = tab.dataset.url;
            try {
                const resp = await fetch(url, {
                    method: "GET",
                    headers: {
                        "x-functions-key": authKey,
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    }      
                })
                const data = await resp.json();
                if (resp.ok && data.ok) {
                    resultData = data.data
                } else {
                    console.error(`GET ${url}: http ${resp.status} with data`, data);
                }
            } catch (e) {
                console.error(`GET ${url}:`, e);
                sendMessage("Error fetching data. Check console logs...", "text-bg-danger", "text-bg-primary")
            }
        }
        document.querySelector(tab.dataset.bsTarget + " .progress").style.display = "none";
        resultRenderer(resultData);
    }
    tabEls.forEach(tabEl => tabEl.addEventListener('shown.bs.tab', () => selectTab(tabEl)))
    selectTab(tabEls[0])

    window.onKeyChange = function(e) {
        if (e) e.preventDefault();
        key.classList.remove("is-invalid")        
        selectTab(activeTab)
    }    

    

    // const creationFormHolder = document.getElementById("admin-form-holder")
    // const dashboard = document.getElementById("dashboard")
    // document.getElementById("closeCreation").addEventListener("click", () => {
    //     creationFormHolder.classList.remove("col-12", "col-md-4")
    //     creationFormHolder.classList.add("col-0")
    //     dashboard.classList.remove("col-md-8")
    //     dashboard.classList.add("col-12 col-tran")
    // })
    
    const onDomainChange = () => {
        let languages = {"python":true}
        let selectedDomain = domain.value;
        if (languages[selectedDomain]) selectedDomain = "programming";
        document.querySelectorAll("[data-programming-placeholder]")
            .forEach(el => {
                let pl = el.dataset[`${selectedDomain}Placeholder`];
                el.setAttribute("placeholder", pl);
            })
    }
    domain.addEventListener("change", onDomainChange)
    onDomainChange();
    log.value = "Fetching logs of active process..."
    let logHistory = "" //persistent part of the logs
    let logCurrent = ""
    const sleep = (ms) => {
        let resolveRes = null;
        let res = new Promise(resolve => resolveRes = resolve)
        setTimeout(() => {
            resolveRes();
        }, ms)
        return res 
    }
    const fetchLogs = async (url) => {
        const authKey = key.value;   
        if (!authKey) return false; 
        try {
            const resp = await fetch(url, {
                method: "GET",
                headers: {
                    "x-functions-key": authKey,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                }
            })    
            const result = await resp.json();
            console.log("Got log", result)
            if (result.ok) {
                if (result.data) {
                    logCurrent = "";                    
                    let startPrefix = dtToStr(result.data.start_ts);
                    logCurrent += `${startPrefix} Process started with settings:\n`;
                    // else logCurrent += `${prefix} Finished process`;
                    // if (result.data.active) logCurrent += " dur " + (Math.round(Date.now() / 1000) - result.data.start_ts) + "s\n"
                    // else logCurrent += " duration " + result.data.duration + "s\n"
                    logCurrent += `\tlang ${result.data.language}, form ${result.data.form}, topic ${result.data.topic}\n`
                    logCurrent += `\tlevel ${result.data.level}, num ${result.data.num}, numBugs ${result.data.numBugs}\n`
                    if (result.data.error) {
                        logCurrent += ` Error: ${result.data.error}\n`
                    } else {
                        (result.data.log || []).forEach((l, i) => {                                                        
                            if (l.i_end_ts) {
                                let iEndPrefix = dtToStr(l.i_end_ts); 
                                let dur = l.i_end_ts - l.i_start_ts
                                if (l.error) { logCurrent += `${iEndPrefix}\t[${i+1}/${result.data.num}] error ${l.error}: ${l.message}\n` }
                                else { logCurrent += `${iEndPrefix}\t[${i+1}/${result.data.num}] success, exercise id: ${l.exercise_id} dur ${dur}s\n` }
                            } else {
                                let iStartPrefix = dtToStr(l.i_start_ts); 
                                logCurrent += `${iStartPrefix}\t[${i+1}/${result.data.num}] started...\n`
                            }
                        })
                    }                    
                    if (result.data.end_ts && !result.data.active) {
                        let endPrefix = dtToStr(result.data.end_ts);
                        logCurrent += `${endPrefix} Process ended\n`;
                    }
                    log.value = logHistory + logCurrent
                    return result.data.active;
                } else {
                    logHistory = logHistory + logCurrent + "\n"
                    if (logHistory == "\n") logHistory = "";
                    logCurrent =  "There are no active creation processes."
                    log.value = logHistory + logCurrent
                    return false;
                }
            } else {
                throw new Error(`Fail response from service ${JSON.stringify(result)}`)                    
            }    
        } catch (e) {
            console.warn(e);
            log.value = "Cannot fetch most recent logs..."
        }
        return false;
    }
    let logActive = false;    
    const fetchLogsLoop = async (cur_op_id) => {
        if (logActive) return;
        logActive = true;
        while(await fetchLogs(log.dataset.url + cur_op_id)) {
            await sleep(4000);
        }
        logActive = false;
    }
    createExercisesForm.addEventListener("submit", async (event) => {
        event.preventDefault(); //do not actually submit
        // button.classList.add("d-none")
        progress.classList.remove("d-none")
        const data = new FormData(event.currentTarget);
        const authKey = data.get("key");
        data.delete("key"); 
        const plainFormData = Object.fromEntries(data.entries());
        ['num','complexity','numErrors'].forEach(prop => {
            plainFormData[prop] = parseInt(plainFormData[prop])
        })
        const formDataJsonString = JSON.stringify(plainFormData); 
        console.log(`Sending request: ${formDataJsonString}`)
        try {   
            const resp = await fetch(createExercisesForm.action, {
                method: createExercisesForm.method,
                headers: {
                    "x-functions-key": authKey,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },            
                body: formDataJsonString
            });
            const result = await resp.json();
            if (result.ok) {
                progress.classList.add("d-none")
                success.classList.remove("d-none")    
                cur_op_id = result.data.id;
                fetchLogsLoop();            
            // } else if (result.error == "Busy") {
            //     confirm("Another exercise creation operation is still in progress. Do you want to cancel ...")
            } else {
                throw new Error(`Fail response from service ${JSON.stringify(result)}`)
            }
        } catch (e) {
            console.error(e);
            progress.classList.add("d-none")
            error.classList.remove("d-none")
        }
    })    
})