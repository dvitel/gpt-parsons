
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
    if (highlighted) hljs.highlightElement(code);
    return pre
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
    if (i == 10) return null;
    if (el.classList.contains("fragment")) return el;
    return findFragEl(el.parentElement, i+1);
}

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

let currentFragments = {}

function dropFragment(event) {
    event.preventDefault();
    const fragmentIdStr = event.dataTransfer.getData("text/plain");
    const fragment = currentFragments[fragmentIdStr];
    fragment.el.focus({preventScroll:true})
}

function dragoverFragment(event) {
    event.preventDefault();
    const fragmentIdStr = event.dataTransfer.getData("text/plain");
    const fragment = currentFragments[fragmentIdStr];
    const bellowEl = findFragEl(event.target);
    if (bellowEl != null && fragment.el != bellowEl) {
        let curIndex = elIndex(fragment.el);
        let otherIndex = elIndex(bellowEl);
        if (curIndex < otherIndex) bellowEl.after(fragment.el);
        else if (curIndex > otherIndex) bellowEl.before(fragment.el);
    }    
}

async function initPuzzle(id) {    
    let parsonsModalEl = document.getElementById("fragments-modal")     
    const saveBtlEl = parsonsModalEl.querySelector(".save-puzzle")
    saveBtlEl.dataset.id = id
    saveBtlEl.dataset.domain = domain
    //first fetch existign puzzle if any     
    let { task, fragments, distractors, shuffled = false } = 
        await fetchAPI(saveBtlEl.dataset.url + "/" + id, "GET", null, "loading puzzle...", true) || {}
    parsonsModalEl.querySelector(".puzzle-task").innerHTML = task 
    parsonsModalEl.querySelector(".puzzle-shuffle").checked = shuffled
    currentFragments = {}           
    let fragmentId = 0
    let bin = [
        ...fragments.map(f => ({f})),
        ...((distractors.length > 0) ? [{f:"Trash wrong fragments bellow", cls:["border-secondary", "fw-bold", "text-white", "bg-secondary", "mb-0", "lh-1", "delim"], noCode:true}] : []),
        ...distractors.map(f => ({f, cls:["bg-light"]}))
    ]
    if (shuffled) bin = shuffle(bin);
    const binEl = parsonsModalEl.querySelector(".fragments");
    clearEl(binEl) 
    bin.forEach(({f, cls = [], noCode = false}, i) => {
        let codeEl = null; 
        if (noCode) {
            codeEl = document.createElement("pre")
            codeEl.innerHTML = f;
        } else {
            codeEl = newCodeTag(f, domain, true);
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
}

async function initSession() {
    let { task, fragments, distractors, shuffled = false } = await fetchAPI(saveBtlEl.dataset.url + "/" + id, "GET", null, "loading puzzle...", true) || {}    
}

const showModal = (id) => bootstrap.Modal.getOrCreateInstance("#" + id).show();
document.addEventListener("DOMContentLoaded", async () => {
    showModal("main-modal")
})