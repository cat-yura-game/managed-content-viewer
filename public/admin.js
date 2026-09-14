const form = document.querySelector("#settingsForm");
const targetUrlInput = document.querySelector("#targetUrl");
const adminTokenInput = document.querySelector("#adminToken");
const currentUrl = document.querySelector("#currentUrl");
const updatedAt = document.querySelector("#updatedAt");
const formMessage = document.querySelector("#formMessage");
const saveButton = document.querySelector("#saveButton");
const togglePassword = document.querySelector("#togglePassword");

function showMessage(text, type = "") {
  formMessage.textContent = text;
  formMessage.className = `form-message ${type}`.trim();
}

function displayConfig(config) {
  currentUrl.textContent = config.targetUrl;
  currentUrl.href = config.targetUrl;
  targetUrlInput.value = config.targetUrl;
  updatedAt.textContent = config.updatedAt
    ? `Изменено: ${new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(config.updatedAt))}`
    : "Используется адрес по умолчанию";
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error();
    displayConfig(await response.json());
  } catch {
    currentUrl.textContent = "Не удалось загрузить";
    currentUrl.removeAttribute("href");
    showMessage("Не удалось получить текущую настройку.", "error");
  }
}

togglePassword.addEventListener("click", () => {
  const shouldShow = adminTokenInput.type === "password";
  adminTokenInput.type = shouldShow ? "text" : "password";
  togglePassword.textContent = shouldShow ? "Скрыть" : "Показать";
  togglePassword.setAttribute("aria-label", shouldShow ? "Скрыть пароль" : "Показать пароль");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("");

  if (!form.reportValidity()) return;

  let url;
  try {
    url = new URL(targetUrlInput.value.trim());
    if (url.protocol !== "https:") throw new Error();
  } catch {
    showMessage("Укажите корректную HTTPS-ссылку.", "error");
    targetUrlInput.focus();
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Сохраняем…";

  try {
    const response = await fetch("/api/config", {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${adminTokenInput.value}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ targetUrl: url.href }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Не удалось сохранить ссылку.");

    displayConfig(result);
    adminTokenInput.value = "";
    showMessage("Ссылка сохранена. Worker уже возвращает данные нового источника.", "success");
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "Не удалось сохранить ссылку.", "error");
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Сохранить ссылку";
  }
});

loadConfig();
