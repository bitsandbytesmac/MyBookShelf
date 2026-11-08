// Redirect to dashboard if already logged in
if (localStorage.getItem("token")) {
    window.location.href = "/";
}

// ==================================
// LOGIN FORM
// ==================================

const loginForm = document.getElementById("loginForm");

if (loginForm) {

    const loginMessage = document.getElementById("loginMessage");

    loginForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;

        try {

            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email,
                    password
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message);
            }

            localStorage.setItem("token", result.data.token);

            localStorage.setItem("user", JSON.stringify({
                id: result.data.id,
                username: result.data.username,
                email: result.data.email
            }));

            loginMessage.textContent = "Login successful!";

            window.location.href = "/";

        } catch (error) {

            loginMessage.textContent = error.message;
            loginMessage.style.color = "#C0392B";

        }

    });

}


// ==================================
// REGISTRATION FORM
// ==================================

const registerForm = document.getElementById("registerForm");

if (registerForm) {

    const registerMessage = document.getElementById("registerMessage");

    registerForm.addEventListener("submit", async function (event) {

        // Prevent page refresh
        event.preventDefault();

        // Get input values
        const username = document.getElementById("username").value;
        const email = document.getElementById("registerEmail").value;
        const password = document.getElementById("registerPassword").value;

        try {

            // Send registration request to backend
            const response = await fetch("/api/auth/register", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    username,
                    email,
                    password
                })
            });

            const result = await response.json();

            // Check registration result
            if (!response.ok) {
                throw new Error(result.message);
            }

            alert("Account created successfully!");

            // Redirect to login page
            window.location.href = "/login.html";

        } catch (error) {

            registerMessage.textContent = error.message;
            registerMessage.style.color = "#C0392B";

        }

    });

}