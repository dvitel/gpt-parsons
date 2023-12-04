
function dropFragment(event) {
    event.preventDefault();
    const fragmentIdStr = event.dataTransfer.getData("text/plain");
    const fragment = currentFragments[fragmentIdStr];
    fragment.el.focus({preventScroll:true})
}

const elIndex = (el) => [...el.parentElement.children].indexOf(el)

const findFragEl = (el, i = 0) => {
    if (i == 10) return null;
    if (el.classList.contains("fragment")) return el;
    return findFragEl(el.parentElement, i+1);
}

async function initParsonsModal({ id, task:defaultTask = "Sort fragments in correct order. Trash wrong fragments.", 
                    fragments:defaultFragments = [], distractors:defaultDistractors = [], domain = "" }) {    
    let parsonsModalEl = document.getElementById("fragments-modal")     
    const saveBtlEl = parsonsModalEl.querySelector(".save-puzzle")
    saveBtlEl.dataset.id = id
    saveBtlEl.dataset.domain = domain
    //first fetch existign puzzle if any     
    let { task = defaultTask, fragments = defaultFragments, distractors = defaultDistractors, shuffled = false } = 
        await fetchAPI(saveBtlEl.dataset.url + "/" + id, "GET", null, "loading puzzle...", true) || {}
    parsonsModalEl.querySelector(".puzzle-task").innerHTML = task 
    parsonsModalEl.querySelector(".puzzle-shuffle").checked = shuffled
    currentFragments = {}           
    let fragmentId = 0
    const bins = {".fragments":[
        ...fragments.map(f => ({f})),
        ...((distractors.length > 0) ? [{f:"Trash wrong fragments bellow", cls:["border-secondary", "fw-bold", "text-white", "bg-secondary", "mb-0", "lh-1", "delim"], noCode:true}] : []),
        ...distractors.map(f => ({f, cls:["bg-light"]}))
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
    })
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




const showModal = (id) => bootstrap.Modal.getOrCreateInstance("#" + id).show();
document.addEventListener("DOMContentLoaded", async () => {
    showModal("main-modal")
})