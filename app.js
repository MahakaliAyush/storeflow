const STORAGE_KEY = "storeflow_tasks_v1";

const starterTasks = [
  {
    id: crypto.randomUUID(),
    title: "Fill front drinks fridge",
    description:
      "Face all lines and keep promotional products visible.",
    department: "Grocery",
    priority: "high",
    dueDate: new Date().toISOString().slice(0, 10),
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
    description:
      "Use FIFO rotation and report products expiring within two days.",
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
    const savedTasks = localStorage.getItem(STORAGE_KEY);

    if (savedTasks) {
      return JSON.parse(savedTasks);
    }

    return starterTasks;
  } catch (error) {
    console.error("Could not load tasks:", error);
    return starterTasks;
  }
}

function saveTasks() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(tasks)
  );
}

function getCurrentRole() {
  return document.getElementById("roleSelect").value;
}

function canManageTasks() {
  return ["manager", "owner"].includes(
    getCurrentRole()
  );
}

function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    character => {
      const characters = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      };

      return characters[character];
    }
  );
}

function formatDate(value) {
  if (!value) {
    return "No due date";
  }

  return new Intl.DateTimeFormat(
    "en-AU",
    {
      weekday: "short",
      day: "numeric",
      month: "short"
    }
  ).format(
    new Date(`${value}T00:00:00`)
  );
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-AU",
    {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit"
    }
  ).format(
    new Date(value)
  );
}

function createTaskCard(task) {
  const completeButton =
    task.status === "todo" &&
    !task.archived
      ? `
        <button
          class="success-button"
          onclick="completeTask('${task.id}')"
        >
          ✓ Mark as Done
        </button>
      `
      : "";

  const reopenButton =
    task.status === "completed" &&
    !task.archived
      ? `
        <button
          class="secondary-button"
          onclick="reopenTask('${task.id}')"
        >
          ↻ Reopen
        </button>
      `
      : "";

  const archiveButton =
    canManageTasks() &&
    !task.archived
      ? `
        <button
          class="danger-button"
          onclick="archiveTask('${task.id}')"
        >
          Archive
        </button>
      `
      : "";

  const restoreButtons =
    canManageTasks() &&
    task.archived
      ? `
        <button
          class="secondary-button"
          onclick="restoreTask('${task.id}')"
        >
          Restore
        </button>

        <button
          class="danger-button"
          onclick="deleteTask('${task.id}')"
        >
          Delete Permanently
        </button>
      `
      : "";

  return `
    <article
      class="
        task-card
        ${task.priority}
        ${task.status === "completed" ? "completed" : ""}
        ${task.archived ? "archived" : ""}
      "
    >

      <div class="task-top">

        <div>

          <h4>
            ${escapeHtml(task.title)}
          </h4>

          ${
            task.description
              ? `
                <p class="task-description">
                  ${escapeHtml(task.description)}
                </p>
              `
              : ""
          }

        </div>

        <div class="badges">

          <span
            class="badge priority-${task.priority}"
          >
            ${task.priority.toUpperCase()}
          </span>

          <span class="badge">
            ${escapeHtml(task.department)}
          </span>

          <span class="badge">
            ${
              task.status === "completed"
                ? "COMPLETED"
                : "TO DO"
            }
          </span>

        </div>

      </div>

      <div class="task-meta">

        <span>
          📅 ${formatDate(task.dueDate)}
        </span>

        <span>
          👤 ${escapeHtml(task.assignedTo || "Anyone")}
        </span>

        <span>
          ＋ ${escapeHtml(task.createdBy)}
        </span>

        ${
          task.completedBy
            ? `
              <span>
                ✅ ${escapeHtml(task.completedBy)}
                ·
                ${formatDateTime(task.completedAt)}
              </span>
            `
            : ""
        }

      </div>

      <div class="task-actions">

        ${completeButton}
        ${reopenButton}
        ${archiveButton}
        ${restoreButtons}

      </div>

    </article>
  `;
}

function renderTaskList(elementId, taskList) {
  const element =
    document.getElementById(elementId);

  if (!taskList.length) {
    element.innerHTML = `
      <div class="empty-state">

        <strong>
          No tasks found
        </strong>

        Nothing is currently available here.

      </div>
    `;

    return;
  }

  element.innerHTML =
    taskList.map(createTaskCard).join("");
}

function renderWeeklyPlanner() {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ];

  const today = new Date();

  const startOfWeek = new Date(today);

  startOfWeek.setDate(
    today.getDate() - today.getDay()
  );

  document.getElementById("weekBoard").innerHTML =
    days.map((dayName, dayIndex) => {
      const date = new Date(startOfWeek);

      date.setDate(
        startOfWeek.getDate() + dayIndex
      );

      const dateKey =
        date.toISOString().slice(0, 10);

      const tasksForDay = tasks.filter(task => {
        return (
          !task.archived &&
          task.dueDate === dateKey
        );
      });

      const taskCards = tasksForDay.length
        ? tasksForDay.map(task => {
            return `
              <div
                class="
                  planner-card
                  ${
                    task.status === "completed"
                      ? "done"
                      : ""
                  }
                "
              >

                <h4>
                  ${escapeHtml(task.title)}
                </h4>

                <p>
                  ${escapeHtml(task.assignedTo || "Anyone")}
                  ·
                  ${task.priority}
                </p>

              </div>
            `;
          }).join("")
        : `
          <div class="empty-day">
            No scheduled tasks
          </div>
        `;

      return `
        <section class="day-column">

          <div class="day-header">

            <strong>
              ${dayName}
            </strong>

            <small>
              ${
                date.toLocaleDateString(
                  "en-AU",
                  {
                    day: "numeric",
                    month: "short"
                  }
                )
              }
            </small>

          </div>

          <div class="day-tasks">
            ${taskCards}
          </div>

        </section>
      `;
    }).join("");
}

function renderFilteredTasks() {
  const searchValue =
    document
      .getElementById("searchInput")
      .value
      .trim()
      .toLowerCase();

  const departmentValue =
    document
      .getElementById("departmentFilter")
      .value;

  const statusValue =
    document
      .getElementById("statusFilter")
      .value;

  const priorityValue =
    document
      .getElementById("priorityFilter")
      .value;

  const filteredTasks = tasks.filter(task => {
    if (task.archived) {
      return false;
    }

    const searchableText = `
      ${task.title}
      ${task.description}
      ${task.createdBy}
      ${task.assignedTo}
    `.toLowerCase();

    const matchesSearch =
      !searchValue ||
      searchableText.includes(searchValue);

    const matchesDepartment =
      departmentValue === "all" ||
      task.department === departmentValue;

    const matchesStatus =
      statusValue === "all" ||
      task.status === statusValue;

    const matchesPriority =
      priorityValue === "all" ||
      task.priority === priorityValue;

    return (
      matchesSearch &&
      matchesDepartment &&
      matchesStatus &&
      matchesPriority
    );
  });

  renderTaskList(
    "allTaskList",
    filteredTasks
  );
}

function renderWebsite() {
  const activeTasks =
    tasks.filter(task => !task.archived);

  const todoTasks =
    activeTasks.filter(
      task => task.status === "todo"
    );

  const completedTasks =
    activeTasks.filter(
      task => task.status === "completed"
    );

  const archivedTasks =
    tasks.filter(task => task.archived);

  document.getElementById(
    "totalCount"
  ).textContent = activeTasks.length;

  document.getElementById(
    "todoCount"
  ).textContent = todoTasks.length;

  document.getElementById(
    "completedCount"
  ).textContent = completedTasks.length;

  document.getElementById(
    "highCount"
  ).textContent =
    todoTasks.filter(
      task => task.priority === "high"
    ).length;

  const completionPercentage =
    activeTasks.length
      ? Math.round(
          (
            completedTasks.length /
            activeTasks.length
          ) * 100
        )
      : 0;

  document.getElementById(
    "progressPercent"
  ).textContent =
    `${completionPercentage}%`;

  document.getElementById(
    "progressRing"
  ).style.setProperty(
    "--p",
    completionPercentage
  );

  document.getElementById(
    "progressText"
  ).textContent =
    completionPercentage === 100
      ? "Excellent — every active task is complete."
      : `${completedTasks.length} of ${activeTasks.length} active tasks completed.`;

  document.getElementById(
    "summaryTodo"
  ).textContent =
    todoTasks.length;

  document.getElementById(
    "summaryDone"
  ).textContent =
    completedTasks.length;

  const sortedDashboardTasks =
    [...todoTasks].sort((firstTask, secondTask) => {
      const priorityOrder = {
        high: 0,
        medium: 1,
        low: 2
      };

      return (
        priorityOrder[firstTask.priority] -
        priorityOrder[secondTask.priority]
      );
    });

  renderTaskList(
    "dashboardTaskList",
    sortedDashboardTasks.slice(0, 6)
  );

  renderTaskList(
    "completedTaskList",
    completedTasks
  );

  renderTaskList(
    "archiveTaskList",
    archivedTasks
  );

  renderFilteredTasks();
  renderWeeklyPlanner();

  document
    .querySelectorAll('[data-view="archive"]')
    .forEach(button => {
      button.style.display =
        canManageTasks()
          ? ""
          : "none";
    });

  if (
    currentView === "archive" &&
    !canManageTasks()
  ) {
    switchView("dashboard");
  }
}

function addTask(event) {
  event.preventDefault();

  const newTask = {
    id: crypto.randomUUID(),

    title:
      document
        .getElementById("taskTitle")
        .value
        .trim(),

    description:
      document
        .getElementById("taskDescription")
        .value
        .trim(),

    department:
      document
        .getElementById("taskDepartment")
        .value,

    priority:
      document
        .getElementById("taskPriority")
        .value,

    dueDate:
      document
        .getElementById("taskDueDate")
        .value,

    assignedTo:
      document
        .getElementById("taskAssignedTo")
        .value
        .trim(),

    createdBy:
      document
        .getElementById("taskCreatedBy")
        .value
        .trim(),

    createdAt:
      new Date().toISOString(),

    status: "todo",
    completedBy: "",
    completedAt: "",
    archived: false
  };

  tasks.unshift(newTask);

  saveTasks();
  closeTaskModal();
  renderWebsite();

  showToast(
    "Task added successfully."
  );
}

window.completeTask = function(taskId) {
  const completedBy = prompt(
    "Who completed this task?",
    "Staff member"
  );

  if (!completedBy) {
    return;
  }

  tasks = tasks.map(task => {
    if (task.id !== taskId) {
      return task;
    }

    return {
      ...task,
      status: "completed",
      completedBy:
        completedBy.trim(),
      completedAt:
        new Date().toISOString()
    };
  });

  saveTasks();
  renderWebsite();

  showToast(
    "Task marked as completed."
  );
};

window.reopenTask = function(taskId) {
  tasks = tasks.map(task => {
    if (task.id !== taskId) {
      return task;
    }

    return {
      ...task,
      status: "todo",
      completedBy: "",
      completedAt: ""
    };
  });

  saveTasks();
  renderWebsite();

  showToast(
    "Task reopened."
  );
};

window.archiveTask = function(taskId) {
  if (!canManageTasks()) {
    showToast(
      "Only the manager or owner can archive tasks."
    );

    return;
  }

  const confirmed = confirm(
    "Archive this task?"
  );

  if (!confirmed) {
    return;
  }

  tasks = tasks.map(task => {
    if (task.id !== taskId) {
      return task;
    }

    return {
      ...task,
      archived: true
    };
  });

  saveTasks();
  renderWebsite();

  showToast(
    "Task moved to archive."
  );
};

window.restoreTask = function(taskId) {
  if (!canManageTasks()) {
    return;
  }

  tasks = tasks.map(task => {
    if (task.id !== taskId) {
      return task;
    }

    return {
      ...task,
      archived: false
    };
  });

  saveTasks();
  renderWebsite();

  showToast(
    "Task restored."
  );
};

window.deleteTask = function(taskId) {
  if (!canManageTasks()) {
    showToast(
      "Only the manager or owner can delete tasks."
    );

    return;
  }

  const confirmed = confirm(
    "Permanently delete this task? This cannot be undone."
  );

  if (!confirmed) {
    return;
  }

  tasks = tasks.filter(
    task => task.id !== taskId
  );

  saveTasks();
  renderWebsite();

  showToast(
    "Task permanently deleted."
  );
};

function openTaskModal() {
  document
    .getElementById("taskModal")
    .classList
    .remove("hidden");

  document
    .getElementById("taskTitle")
    .focus();
}

function closeTaskModal() {
  document
    .getElementById("taskModal")
    .classList
    .add("hidden");

  document
    .getElementById("taskForm")
    .reset();

  document
    .getElementById("taskPriority")
    .value = "medium";

  const currentRole =
    getCurrentRole();

  document
    .getElementById("taskCreatedBy")
    .value =
      currentRole === "owner"
        ? "Owner"
        : currentRole === "manager"
          ? "Ayush"
          : "Staff member";
}

function switchView(viewName) {
  currentView = viewName;

  const viewTitles = {
    dashboard: "Dashboard",
    planner: "Weekly Planner",
    tasks: "All Tasks",
    completed: "Completed Tasks",
    archive: "Archive"
  };

  document
    .querySelectorAll(".view")
    .forEach(view => {
      view.classList.remove("active");
    });

  document
    .querySelectorAll(".nav-link")
    .forEach(button => {
      button.classList.remove("active");
    });

  document
    .getElementById(`${viewName}View`)
    .classList
    .add("active");

  document
    .querySelector(
      `[data-view="${viewName}"]`
    )
    ?.classList
    .add("active");

  document
    .getElementById("pageTitle")
    .textContent =
      viewTitles[viewName];

  document
    .getElementById("sidebar")
    .classList
    .remove("open");

  document
    .getElementById("mobileOverlay")
    .classList
    .remove("show");
}

let toastTimer;

function showToast(message) {
  const toast =
    document.getElementById("toast");

  toast.textContent = message;

  toast.classList.remove("hidden");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 2500);
}

function setGreeting() {
  const currentHour =
    new Date().getHours();

  let greetingText =
    "Good evening";

  if (currentHour < 12) {
    greetingText =
      "Good morning";
  } else if (currentHour < 17) {
    greetingText =
      "Good afternoon";
  }

  document
    .getElementById("greeting")
    .textContent =
      `${greetingText}, Ayush`;

  document
    .getElementById("todayDate")
    .textContent =
      new Date()
        .toLocaleDateString(
          "en-AU",
          {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
          }
        )
        .toUpperCase();
}

/* NAVIGATION */

document
  .querySelectorAll(".nav-link")
  .forEach(button => {
    button.addEventListener(
      "click",
      () => {
        switchView(
          button.dataset.view
        );
      }
    );
  });

document
  .querySelectorAll("[data-go-view]")
  .forEach(button => {
    button.addEventListener(
      "click",
      () => {
        switchView(
          button.dataset.goView
        );
      }
    );
  });

/* ADD TASK MODAL */

document
  .querySelectorAll(".open-task-modal")
  .forEach(button => {
    button.addEventListener(
      "click",
      openTaskModal
    );
  });

document
  .getElementById("closeModal")
  .addEventListener(
    "click",
    closeTaskModal
  );

document
  .getElementById("cancelModal")
  .addEventListener(
    "click",
    closeTaskModal
  );

document
  .getElementById("taskModal")
  .addEventListener(
    "click",
    event => {
      if (
        event.target.id === "taskModal"
      ) {
        closeTaskModal();
      }
    }
  );

document
  .getElementById("taskForm")
  .addEventListener(
    "submit",
    addTask
  );

/* FILTERS */

document
  .getElementById("searchInput")
  .addEventListener(
    "input",
    renderFilteredTasks
  );

document
  .getElementById("departmentFilter")
  .addEventListener(
    "change",
    renderFilteredTasks
  );

document
  .getElementById("statusFilter")
  .addEventListener(
    "change",
    renderFilteredTasks
  );

document
  .getElementById("priorityFilter")
  .addEventListener(
    "change",
    renderFilteredTasks
  );

/* ROLE */

document
  .getElementById("roleSelect")
  .addEventListener(
    "change",
    () => {
      renderWebsite();

      showToast(
        `Role changed to ${getCurrentRole()}.`
      );
    }
  );

/* MOBILE MENU */

document
  .getElementById("menuButton")
  .addEventListener(
    "click",
    () => {
      document
        .getElementById("sidebar")
        .classList
        .toggle("open");

      document
        .getElementById("mobileOverlay")
        .classList
        .toggle("show");
    }
  );

document
  .getElementById("mobileOverlay")
  .addEventListener(
    "click",
    () => {
      document
        .getElementById("sidebar")
        .classList
        .remove("open");

      document
        .getElementById("mobileOverlay")
        .classList
        .remove("show");
    }
  );

setGreeting();
saveTasks();
renderWebsite();