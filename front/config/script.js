document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("admin-form")
    const progress = document.getElementById("progress")
    const error = document.getElementById("error")
    const success = document.getElementById("success")
    const button = document.getElementById("submit-button")
    const key = document.getElementById("key")
    const log = document.getElementById("log")
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
                    let now = new Date()
                    const dtToStr = (dt) => {
                        let start = new Date(dt * 1000)
                        let sameDay = now.getDate() == start.getDate()
                        let timePart = [start.getHours(), start.getMinutes(), start.getSeconds()].map(s => (s < 10 ? "0" : "") + s).join(":")
                        let prefix = timePart;
                        if (!sameDay) {
                            let datePart = [start.getMonth(), start.getDate()].map(s => (s < 10 ? "0" : "") + s).join("/")
                            prefix = datePart + " " + timePart;
                        }     
                        return prefix;
                    }
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
                            let iEndPrefix = dtToStr(l.i_end_ts); 
                            let dur = l.i_end_ts - l.i_start_ts
                            if (l.error) logCurrent += `${iEndPrefix}\t[${i+1}/${result.data.num}] error ${l.error}: ${l.message}\n`
                            else logCurrent += `${iEndPrefix}\t[${i+1}/${result.data.num}] success, exercise id: ${l.exercise_id} dur ${dur}s\n`
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
    let cur_op_id = "";
    const fetchLogsLoop = async () => {
        if (logActive) return;
        logActive = true;
        while(await fetchLogs(log.dataset.url + cur_op_id)) {
            await sleep(2000);
        }
        logActive = false;
    }    
    key.addEventListener("change", async () => {
        await fetchLogsLoop();
    })
    if (!!key.value) fetchLogsLoop();
    let inProgress = false;
    form.addEventListener("submit", async (event) => {
        event.preventDefault(); //do not actually submit
        if (inProgress) return;
        inProgress = true;
        button.classList.add("d-none")
        progress.classList.remove("d-none")
        const data = new FormData(event.currentTarget);
        const authKey = data.get("key");
        data.delete("key"); 
        const plainFormData = Object.fromEntries(data.entries());
        plainFormData['num'] = parseInt(plainFormData['num'])
        const formDataJsonString = JSON.stringify(plainFormData); 
        console.log(`Sending request: ${formDataJsonString}`)
        try {   
            const resp = await fetch(form.action, {
                method: form.method,
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