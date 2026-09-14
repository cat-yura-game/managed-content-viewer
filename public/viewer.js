const loadingState = document.querySelector("#loadingState");
const errorState = document.querySelector("#errorState");
const errorText = document.querySelector("#errorText");
const contentFrame = document.querySelector("#contentFrame");
const sourceLink = document.querySelector("#sourceLink");
const openDirectLink = document.querySelector("#openDirectLink");
const frameNotice = document.querySelector("#frameNotice");
const retryButton = document.querySelector("#retryButton");

async function loadTarget() {
  loadingState.hidden = false;
  errorState.hidden = true;
  contentFrame.hidden = true;
  frameNotice.hidden = true;

  try {
    const response = await fetch("/api/config", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("API недоступен");

    const config = await response.json();
    const url = new URL(config.targetUrl);
    if (url.protocol !== "https:") throw new Error("Получен некорректный адрес");

    sourceLink.textContent = url.hostname;
    sourceLink.href = url.href;
    openDirectLink.href = url.href;
    contentFrame.src = url.href;
    loadingState.hidden = true;
    contentFrame.hidden = false;
    frameNotice.hidden = false;
  } catch (error) {
    loadingState.hidden = true;
    errorState.hidden = false;
    errorText.textContent = error instanceof Error ? error.message : "Попробуйте обновить страницу.";
  }
}

retryButton.addEventListener("click", loadTarget);
loadTarget();
