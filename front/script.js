let mainForm = null;
let sessionId = null;
let puzzleId = null;
// let currentFragments = {}
let draggedFragment = null;
let messageToastEl = null; //error/info messages in form of toast
let puzzleStats = { moves: 0, start_ts: 0, end_ts: 0 } //only client side portion
let emptyImg = document.createElement('img')
emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
let moves = 0;
let numChanges = 0;

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
    pre.classList.add("mb-0", "lh-1", "p-0");    
    let code = document.createElement("code");
    pre.appendChild(code);
    code.classList.add("language-" + codeLang, "p-2", "overflow-y-hidden");
    code.innerHTML = codeText;
    if (highlighted) hljs.highlightElement(code);
    return pre
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
        fetchOpsCount++;
        inform(progressMsg, true);
        const body = !!data ? JSON.stringify(data) : null;
        console.log(`${method} ${url}`, data)
        const resp = await fetch(url, {
            method,
            headers: {
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


const elIndex = (el) => [...el.parentElement.children].indexOf(el)

const findFragEl = (el, i = 0) => {
    if (el == null) return null;
    if (i == 4) return null;
    if (el.classList.contains("fragment")) return el;
    return findFragEl(el.parentElement, i+1);
}

const focus = (el) => {
    // el.contentEditable = true;
    // el.focus({preventScroll:true, focusVisible: true})
    el.focus({preventScroll:true});
    // el.contentEditable = false;
}

function dropFragment(event) {
    // if ("touches" in event) {

    // } else {
    event.preventDefault();
    // }
    focus(draggedFragment);
}

function dragoverFragment(event) {    
    event.preventDefault();
    let bellowEl = null; 
    if ("touches" in event) {
        let touchedEl = document.elementFromPoint(event.touches[0].clientX, event.touches[0].clientY);
        bellowEl = findFragEl(touchedEl)
    } else {        
        bellowEl = findFragEl(event.target);
    }
    if (bellowEl != null && draggedFragment != bellowEl) {
        let curIndex = elIndex(draggedFragment);
        let otherIndex = elIndex(bellowEl);
        if (curIndex < otherIndex) {
            bellowEl.after(draggedFragment);
            numChanges++  
        } else if (curIndex > otherIndex) {
            bellowEl.before(draggedFragment);
            numChanges++;
        }
    }
    focus(draggedFragment);
}

function initPuzzle({ id, domain, task = "Put fragments in correct order. Trash wrong fragments.", fragments, distractors } = {}) {    
    puzzleId = id;
    mainForm.querySelector(".puzzle-task").innerHTML = task;
    // currentFragments = {}
    let bin = [
        ...fragments.map(f => ({f})),
        {f:"Trash wrong fragments bellow", cls:["border-secondary", "fw-bold", "text-white", "bg-secondary", "mb-0", "lh-1", "delim", "p-0"], noCode:true},
        ...distractors.map(f => ({f}))
    ]
    const binEl = mainForm.querySelector(".fragments");
    clearEl(binEl) 
    bin.forEach(({f, cls = [], noCode = false}) => {
        let codeEl = null; 
        if (noCode) {
            let spanEl = document.createElement("div") 
            spanEl.classList.add('p-2')
            codeEl = document.createElement("pre")
            spanEl.innerHTML = f;
            codeEl.appendChild(spanEl);
        } else {
            codeEl = newCodeTag(f, domain, true);
        }                
        codeEl.classList.add("border", "fragment", ...cls)

        codeEl.draggable = true
        codeEl.tabIndex = 0;
        // codeEl.lastChild.tabIndex = 0;
        codeEl.addEventListener("click", (ev) => {            
            if (numChanges > 0) {
                numChanges = 0;
                moves++;
            }
            focus(codeEl)
        })
        codeEl.addEventListener("keyup", (ev) => {
            if ((ev.code == "ArrowUp") && codeEl.previousElementSibling) {
                codeEl.previousElementSibling.before(codeEl)
                numChanges++;
            } else if ((ev.code == "ArrowDown") && codeEl.nextElementSibling) {
                codeEl.nextElementSibling.after(codeEl) 
                numChanges++;
            }
            focus(codeEl)
        })
        const dragStart = (ev) => {
            draggedFragment = codeEl;
            if ("dataTransfer" in ev) {
                ev.dataTransfer.effectAllowed = "move";
                ev.dataTransfer.setDragImage(emptyImg, 0, 0)
            }
            if (numChanges > 0) {
                numChanges = 0;
                moves++;
            }
            focus(draggedFragment);
        }
        codeEl.addEventListener("dragstart", dragStart)
        codeEl.addEventListener("touchstart", dragStart)
        binEl.appendChild(codeEl)
    })
}

async function resetSession() {
    let domain = mainForm.querySelector("[name=domain]").value
    localStorage.removeItem(`${domain}_session`)
    await initSession(domain) //restarts puzzles
}

async function continueSession() {
    let { puzzle } = await fetchAPI(mainForm.action + "/" + sessionId, "GET") || {}
    if (!puzzle) return; //error 
    initPuzzle(puzzle);
}

async function initSession(domain) {
    moves = 0;
    let prevSessionId = localStorage.getItem(`${domain}_session`)
    if (prevSessionId) {
        sessionId = prevSessionId;
        console.log(`continue session ${sessionId} ${domain}`)
        await continueSession();
    } else {
        let data = {domain}
        if (sessionId) data.prevSessionId = sessionId;
        let { id: sid, puzzle } = await fetchAPI(mainForm.action, "POST", data) || {}
        if (!sid) return; //error 
        if (sid == sessionId) {
            console.log(`continue session ${sessionId} ${domain}`)
        } else {
            sessionId = sid;                
            console.log(`starting session ${sessionId} ${domain}`)
        }
        localStorage.setItem(`${domain}_session`, sid);
        initPuzzle(puzzle);
    }
}

async function domainChanged(domain) {
    console.log("domain changed to", domain);
    await initSession(domain);
}

function showHint(event) {
    let hint = event.target.dataset.hint;
    inform(hint, false, ["text-info"]);
}

async function submitPuzzle(event) {
    event.preventDefault();
    // const data = new FormData(event.currentTarget);
    // const plainFormData = Object.fromEntries(data.entries());
    const fragments = []
    const distractors = [];
    let curList = fragments;
    [...mainForm.querySelectorAll(".fragment")].forEach(frEl => {
        if (frEl.classList.contains("delim")) curList = distractors;
        else curList.push(frEl.innerText);    
    })

    let skip = event.submitter.name == "skip"
    if (numChanges > 0) {
        numChanges = 0;
        moves++;
    }    
    let data = { fragments, stats: { moves }, skip}
    let { solved, puzzle, hint, reset = false } = await fetchAPI(mainForm.action + "/" + sessionId, "PUT", data) || {}
    if (typeof solved == "undefined") return;     
    moves = 0;
    if (reset) {
        inform("Exercise was deleted. Fetching new one...")
        await resetSession();
        return;
    }
    let hintBtn = document.getElementById("hint")
    if (hint) {        
        hintBtn.classList.remove("d-none")
        hintBtn.dataset.hint = hint; 
    } else {
        hintBtn.classList.add("d-none");
    }
    if (solved) {
        inform("Puzzle solved correctly!", false, ["text-success", "fw-bold"])   
    } else if (!puzzle) {
        inform("You solution contains errors!", false, ["text-danger", "fw-bold"])     
    }
    if (puzzle) initPuzzle(puzzle);
}

// const showModal = (id) => bootstrap.Modal.getOrCreateInstance("#" + id).show();
document.addEventListener("DOMContentLoaded", async () => {
    // showModal("main-modal")
    // mainModal = document.getElementById("main-modal")
    messageToastEl = document.getElementById('message')
    mainForm = document.getElementById("main-form");
    domainChanged(mainForm.querySelector("[name=domain]").value);
})