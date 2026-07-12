const STORAGE_KEY = "storeflow_tasks_v1";

const starterTasks = [
  {
    id: crypto.randomUUID(),
    title: "Fill front drinks fridge",
    description: "Make sure all lines are faced up and promotional products are visible.",
    department: "Grocery",
    priority: "high",
    dueDate: "",
    assignedTo: "Evening staff",
    createdBy: "Ayush",
    createdAt: new Date().toISOString(),
    status: "todo",
    completedBy: "",
    completedAt: "",
    archived: false
  },
  {
    id: crypto.randomUUID(),
    title: "Check dairy expiry dates",
    description: "Use FIFO rotation and report any products expiring within two days.",
    department: "Dairy",
    priority: "medium",
    dueDate: "",
    assignedTo: "Morning staff",
    createdBy: "Ayush",
    createdAt: new Date().toISOString(),
    status: "todo",
    completedBy: "",
    completedAt: "",
    archived: false
  }
];

let tasks = loadTasks();
let currentView = "dashboard";

function loadTasks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : starterTasks;
  } catch {
    return starterTasks;
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function currentRole() {
  return document.getElementById("roleSelect").value;
}

function canManageTasks() {
  return ["manager", "owner"].includes(currentRole());
}

function formatDate(value) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value = "") {
  return value.replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function taskCard(task) {
  const role = currentRole();
  const managerActions = canManageTasks();

  const completeButton = task.status === "todo" && !task.archived
    ? `<button class="success-button" onclick="completeTask('${task.id}')">✓ Mark as Done</button>`
    : "";

  const reopenButton = task.status === "completed" && !task.archived
    ? `<button class="secondary-button" onclick="reopenTask('${task.id}')">↻ Reopen</button>`
    : "";

  const archiveButton = managerActions && !task.archived
    ? `<button class="danger-button" onclick="archiveTask('${task.id}')">Archive</button>`
    : "";

  const restoreButton = managerActions && task.archived
    ? `<button class="secondary-button" onclick="restoreTask('${task.id}')">Restore</button>
       <button class="danger-button" onclick="permanentlyDeleteTask('${task.id}')">Delete Permanently</button>`
    : "";

  return `
    <article class="task-card ${task.status === "completed" ? "completed" : ""} ${task.archived ? "archived" : ""}">
      <div class="task-top">
        <div>
          <h4>${escapeHtml(task.title)}</h4>
          ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ""}
        </div>
        <div class="badges">
          <span class="badge priority-${task.priority}">${task.priority.toUpperCase()}</span>
          <span class="badge">${escapeHtml(task.department)}</span>
          <span class="badge">${task.status === "completed" ? "COMPLETED" : "TO DO"}</span>
        </div>
      </div>

      <div class="task-meta">
        <span>📅 ${formatDate(task.dueDate)}</span>
        <span>👤 Assigned: ${escapeHtml(task.assignedTo || "Anyone")}</span>
        <span>➕ Added by ${escapeHtml(task.createdBy)}</span>
        ${task.completedBy ? `<span>✅ Completed by ${escapeHtml(task.completedBy)} · ${formatDateTime(task.completedAt)}</span>` : ""}
      </div>

      <div class="task-actions">
        ${completeButton}
        ${reopenButton}
        ${archiveButton}
        ${restoreButton}
      </div>
    </article>
  `;
}

function renderList(elementId, list) {
  const element = document.getElementById(elementId);
  if (!list.length) {
    element.innerHTML = `
      <div class="empty-state">
        <strong>No tasks found</strong>
        Nothing is currently available in this section.
      </div>`;
    return;
  }
  element.innerHTML = list.map(taskCard).join("");
}

function render() {
  const active = tasks.filter(task => !task.archived);
  const todo = active.filter(task => task.status === "todo");
  const completed = active.filter(task => task.status === "completed");
  const archived = tasks.filter(task => task.archived);

  document.getElementById("totalCount").textContent = active.length;
  document.getElementById("todoCount").textContent = todo.length;
  document.getElementById("completedCount").textContent = completed.length;
  document.getElementById("highCount").textContent =
    todo.filter(task => task.priority === "high").length;

  renderList("dashboardTaskList", todo.slice(0, 6));
  renderList("completedTaskList", completed);
  renderList("archiveTaskList", archived);
  renderFilteredTasks();

  document.querySelectorAll('[data-view="archive"]').forEach(button => {
    button.style.display = canManageTasks() ? "" : "none";
  });

  if (currentView === "archive" && !canManageTasks()) {
    switchView("dashboard");
  }
}

function renderFilteredTasks() {
  const search = document.getElementById("searchInput").value.trim().toLowerCase();
  const department = document.getElementById("departmentFilter").value;
  const status = document.getElementById("statusFilter").value;

  const filtered = tasks.filter(task => {
    if (task.archived) return false;
    const searchable = `${task.title} ${task.description} ${task.createdBy} ${task.assignedTo}`.toLowerCase();
    return (!search || searchable.includes(search))
      && (department === "all" || task.department === department)
      && (status === "all" || task.status === status);
  });

  renderList("allTaskList", filtered);
}

function addTask(event) {
  event.preventDefault();

  tasks.unshift({
    id: crypto.randomUUID(),
    title: document.getElementById("taskTitle").value.trim(),
    description: document.getElementById("taskDescription").value.trim(),
    department: document.getElementById("taskDepartment").value,
    priority: document.getElementById("taskPriority").value,
    dueDate: document.getElementById("taskDueDate").value,
    assignedTo: document.getElementById("taskAssignedTo").value.trim(),
    createdBy: document.getElementById("taskCreatedBy").value.trim(),
    createdAt: new Date().toISOString(),
    status: "todo",
    completedBy: "",
    completedAt: "",
    archived: false
  });

  saveTasks();
  closeModal();
  render();
  showToast("Task added successfully.");
}

window.completeTask = function(id) {
  const name = prompt("Who completed this task?", "Staff member");
  if (!name) return;

  tasks = tasks.map(task => task.id === id ? {
    ...task,
    status: "completed",
    completedBy: name.trim(),
    completedAt: new Date().toISOString()
  } : task);

  saveTasks();
  render();
  showToast("Task marked as completed.");
};

window.reopenTask = function(id) {
  tasks = tasks.map(task => task.id === id ? {
    ...task,
    status: "todo",
    completedBy: "",
    completedAt: ""
  } : task);

  saveTasks();
  render();
  showToast("Task reopened.");
};

window.archiveTask = function(id) {
  if (!canManageTasks()) {
    showToast("Only the manager or owner can archive tasks.");
    return;
  }
  if (!confirm("Archive this task?")) return;

  tasks = tasks.map(task => task.id === id ? { ...task, archived: true } : task);
  saveTasks();
  render();
  showToast("Task moved to archive.");
};

window.restoreTask = function(id) {
  if (!canManageTasks()) return;
  tasks = tasks.map(task => task.id === id ? { ...task, archived: false } : task);
  saveTasks();
  render();
  showToast("Task restored.");
};

window.permanentlyDeleteTask = function(id) {
  if (!canManageTasks()) {
    showToast("Only the manager or owner can delete tasks.");
    return;
  }
  if (!confirm("Permanently delete this task? This cannot be undone.")) return;

  tasks = tasks.filter(task => task.id !== id);
  saveTasks();
  render();
  showToast("Task permanently deleted.");
};

function openModal() {
  document.getElementById("taskModal").classList.remove("hidden");
  document.getElementById("taskTitle").focus();
}

function closeModal() {
  document.getElementById("taskModal").classList.add("hidden");
  document.getElementById("taskForm").reset();
  document.getElementById("taskPriority").value = "medium";
  document.getElementById("taskCreatedBy").value =
    currentRole() === "owner" ? "Owner" : currentRole() === "manager" ? "Ayush" : "Staff member";
}

function switchView(view) {
  currentView = view;
  const titles = {
    dashboard: "Dashboard",
    tasks: "All Tasks",
    completed: "Completed Tasks",
    archive: "Archive"
  };

  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach(el => el.classList.remove("active"));

  document.getElementById(`${view}View`).classList.add("active");
  document.querySelector(`[data-view="${view}"]`)?.classList.add("active");
  document.getElementById("pageTitle").textContent = titles[view];

  document.getElementById("sidebar").classList.remove("open");
}

let toastTimer;
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 2600);
}

document.querySelectorAll(".nav-link").forEach(button =>
  button.addEventListener("click", () => switchView(button.dataset.view))
);

document.querySelectorAll("[data-go-view]").forEach(button =>
  button.addEventListener("click", () => switchView(button.dataset.goView))
);

document.querySelectorAll(".open-task-modal").forEach(button =>
  button.addEventListener("click", openModal)
);

document.getElementById("closeModal").addEventListener("click", closeModal);
document.getElementById("cancelModal").addEventListener("click", closeModal);
document.getElementById("taskModal").addEventListener("click", event => {
  if (event.target.id === "taskModal") closeModal();
});
document.getElementById("taskForm").addEventListener("submit", addTask);
document.getElementById("searchInput").addEventListener("input", renderFilteredTasks);
document.getElementById("departmentFilter").addEventListener("change", renderFilteredTasks);
document.getElementById("statusFilter").addEventListener("change", renderFilteredTasks);
document.getElementById("roleSelect").addEventListener("change", () => {
  render();
  showToast(`Role changed to ${currentRole()}.`);
});
document.getElementById("menuButton").addEventListener("click", () =>
  document.getElementById("sidebar").classList.toggle("open")
);

saveTasks();
render();
