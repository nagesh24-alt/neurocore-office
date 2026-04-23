function showTab(tab) {
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  document.getElementById(tab).style.display = "block";
}

// Default open
showTab("editor");

// AI function
async function runAI() {
  const text = document.getElementById("input").value;
  const action = document.getElementById("action").value;

  const res = await fetch("/ai-edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, action })
  });

  const result = await res.text();
  document.getElementById("output").innerText = result;
}