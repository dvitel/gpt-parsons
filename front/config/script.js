document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("admin-form")
    const progress = document.getElementById("progress")
    const error = document.getElementById("error")
    const success = document.getElementById("success")
    const button = document.getElementById("submit-button")
    let inProgress = false;
    form.addEventListener("submit", async (event) => {
        event.preventDefault(); //do not actually submit
        if (inProgress) return;
        inProgress = true;
        button.classList.add("d-none")
        progress.classList.remove("d-none")
        const data = new FormData(event.currentTarget);
        const plainFormData = Object.fromEntries(data.entries());
        const formDataJsonString = JSON.stringify(plainFormData); 
        console.log(`Sending request: ${formDataJsonString}`)
        try {   
            const resp = await fetch(form.action, {
                method: form.method,
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },            
                body: formDataJsonString
            });
            const result = await resp.json();
            if (result.ok) {
                progress.classList.add("d-none")
                success.classList.remove("d-none")
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