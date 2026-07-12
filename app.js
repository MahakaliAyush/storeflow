/* =========================================
   STOREFLOW — SUPABASE USERNAME VERSION
========================================= */

const supabaseClient =
  window.supabase.createClient(
    STOREFLOW_CONFIG.supabaseUrl,
    STOREFLOW_CONFIG.supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

/* =========================================
   GLOBAL STATE
========================================= */

let tasks = [];
let profiles = [];

let currentUser = null;
let currentProfile = null;
let currentView = "dashboard";

let realtimeChannel = null;
let toastTimer = null;
let isInitialising = false;

/* =========================================
   ELEMENT HELPERS
========================================= */

function getElement(id) {
  return document.getElementById(id);
}

function showElement(id) {
  getElement(id)?.classList.remove("hidden");
}

function hideElement(id) {
  getElement(id)?.classList.add("hidden");
}

/* =========================================
   SECURITY AND TEXT HELPERS
========================================= */

function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    character => {
      const replacements = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      };

      return replacements[character];
    }
  );
}

function canManageTasks() {
  return (
    currentProfile?.role === "manager" ||
    currentProfile?.role === "owner"
  );
}

function getProfileName(userId) {
  if (!userId) {
    return "";
  }

  const profile = profiles.find(
    item => item.id === userId
  );

  return profile?.full_name || "Staff member";
}

function getInitials(name = "") {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return "SF";
  }

  return words
    .slice(0, 2)
    .map(word => word[0].toUpperCase())
    .join("");
}

/* =========================================
   DATE HELPERS
========================================= */

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
  ).format(new Date(value));
}

function getLocalDateKey(date) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function setGreeting() {
  const currentHour =
    new Date().getHours();

  let greeting = "Good evening";

  if (currentHour < 12) {
    greeting = "Good morning";
  } else if (currentHour < 17) {
    greeting = "Good afternoon";
  }

  const firstName =
    currentProfile?.full_name
      ?.trim()
      ?.split(/\s+/)[0] ||
    "Team";

  getElement("greeting").textContent =
    `${greeting}, ${firstName}`;

  getElement("todayDate").textContent =
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

/* =========================================
   USERNAME LOGIN
========================================= */

async function signIn(event) {
  event.preventDefault();

  const username =
    getElement("loginUsername")
      .value
      .trim()
      .toLowerCase();

  const password =
    getElement("loginPassword")
      .value;

  const loginButton =
    getElement("loginButton");

  const loginError =
    getElement("loginError");

  loginError.textContent = "";
  loginError.classList.add("hidden");

  const usernamePattern =
    /^[a-z0-9._-]+$/;

  if (!usernamePattern.test(username)) {
    loginError.textContent =
      "Username can only contain letters, numbers, dots, dashes and underscores.";

    loginError.classList.remove("hidden");

    return;
  }

  const hiddenEmail =
    `${username}@storeflow.internal`;

  loginButton.textContent =
    "Signing In...";

  loginButton.classList.add(
    "loading-button"
  );

  try {
    const { error } =
      await supabaseClient.auth
        .signInWithPassword({
          email: hiddenEmail,
          password
        });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error(
      "StoreFlow login error:",
      error
    );

    loginError.textContent =
      "Incorrect username or password.";

    loginError.classList.remove(
      "hidden"
    );
  } finally {
    loginButton.textContent =
      "Sign In";

    loginButton.classList.remove(
      "loading-button"
    );
  }
}

async function signOut() {
  const logoutButton =
    getElement("logoutButton");

  logoutButton.disabled = true;
  logoutButton.textContent = "Logging Out...";

  const { error } =
    await supabaseClient.auth.signOut();

  logoutButton.disabled = false;
  logoutButton.textContent = "Log Out";

  if (error) {
    console.error(
      "Logout error:",
      error
    );

    showToast(
      `Could not log out: ${error.message}`
    );
  }
}

/* =========================================
   CURRENT USER PROFILE
========================================= */

async function loadCurrentProfile() {
  if (!currentUser) {
    currentProfile = null;
    return false;
  }

  const { data, error } =
    await supabaseClient
      .from("profiles")
      .select(
        "id, full_name, role, active"
      )
      .eq("id", currentUser.id)
      .single();

  if (error) {
    console.error(
      "Current profile loading error:",
      error
    );

    showToast(
      "Your profile could not be loaded."
    );

    return false;
  }

  if (!data.active) {
    showToast(
      "Your StoreFlow account is inactive."
    );

    await supabaseClient.auth.signOut();

    return false;
  }

  currentProfile = data;

  updateUserDisplay();

  return true;
}

function updateUserDisplay() {
  const fullName =
    currentProfile?.full_name ||
    "Staff Member";

  getElement("signedInName").textContent =
    fullName;

  getElement("signedInRole").textContent =
    currentProfile?.role || "staff";

  getElement("userAvatar").textContent =
    getInitials(fullName);

  document
    .querySelectorAll(
      '[data-view="archive"]'
    )
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

/* =========================================
   LOAD ACTIVE STAFF PROFILES
========================================= */

async function loadProfiles() {
  const { data, error } =
    await supabaseClient
      .from("profiles")
      .select(
        "id, full_name, role, active"
      )
      .eq("active", true)
      .order(
        "full_name",
        {
          ascending: true
        }
      );

  if (error) {
    console.error(
      "Profile list loading error:",
      error
    );

    profiles = [];

    return;
  }

  profiles = data || [];
}

/* =========================================
   LOAD SHARED TASKS
========================================= */

async function loadTasks() {
  const { data, error } =
    await supabaseClient
      .from("tasks")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      );

  if (error) {
    console.error(
      "Task loading error:",
      error
    );

    showToast(
      `Could not load tasks: ${error.message}`
    );

    return;
  }

  tasks = (data || []).map(task => ({
    id: task.id,
    title: task.title,
    description:
      task.description || "",
    department:
      task.department,
    priority:
      task.priority,
    dueDate:
      task.due_date || "",
    assignedTo:
      task.assigned_to || "",
    createdBy:
      task.created_by,
    createdAt:
      task.created_at,
    status:
      task.status,
    completedBy:
      task.completed_by,
    completedAt:
      task.completed_at,
    archived:
      task.archived
  }));

  renderWebsite();
}

/* =========================================
   TASK CARD
========================================= */

function createTaskCard(task) {
  const createdByName =
    getProfileName(task.createdBy);

  const completedByName =
    getProfileName(task.completedBy);

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
    !task.archived &&
    canManageTasks()
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

  const archivedButtons =
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
        ${escapeHtml(task.priority)}
        ${
          task.status === "completed"
            ? "completed"
            : ""
        }
        ${
          task.archived
            ? "archived"
            : ""
        }
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
            class="badge priority-${escapeHtml(task.priority)}"
          >
            ${escapeHtml(task.priority.toUpperCase())}
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
          ＋ ${escapeHtml(createdByName)}
        </span>

        ${
          task.completedBy
            ? `
              <span>
                ✅ ${escapeHtml(completedByName)}
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
        ${archivedButtons}

      </div>

    </article>
  `;
}

function renderTaskList(
  elementId,
  taskList
) {
  const element =
    getElement(elementId);

  if (!element) {
    return;
  }

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
    taskList
      .map(createTaskCard)
      .join("");
}

/* =========================================
   WEEKLY PLANNER
========================================= */

function renderWeeklyPlanner() {
  const weekBoard =
    getElement("weekBoard");

  if (!weekBoard) {
    return;
  }

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

  const startOfWeek =
    new Date(today);

  startOfWeek.setHours(
    0,
    0,
    0,
    0
  );

  startOfWeek.setDate(
    today.getDate() -
    today.getDay()
  );

  weekBoard.innerHTML =
    days.map(
      (dayName, index) => {
        const date =
          new Date(startOfWeek);

        date.setDate(
          startOfWeek.getDate() +
          index
        );

        const dateKey =
          getLocalDateKey(date);

        const dayTasks =
          tasks.filter(task => {
            return (
              !task.archived &&
              task.dueDate === dateKey
            );
          });

        const taskHtml =
          dayTasks.length
            ? dayTasks.map(task => {
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
                      ${escapeHtml(task.priority)}
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
              ${taskHtml}
            </div>

          </section>
        `;
      }
    ).join("");
}

/* =========================================
   TASK FILTERS
========================================= */

function renderFilteredTasks() {
  const searchInput =
    getElement("searchInput");

  const departmentFilter =
    getElement("departmentFilter");

  const statusFilter =
    getElement("statusFilter");

  const priorityFilter =
    getElement("priorityFilter");

  if (
    !searchInput ||
    !departmentFilter ||
    !statusFilter ||
    !priorityFilter
  ) {
    return;
  }

  const search =
    searchInput
      .value
      .trim()
      .toLowerCase();

  const department =
    departmentFilter.value;

  const status =
    statusFilter.value;

  const priority =
    priorityFilter.value;

  const filteredTasks =
    tasks.filter(task => {
      if (task.archived) {
        return false;
      }

      const searchableText = `
        ${task.title}
        ${task.description}
        ${task.department}
        ${task.assignedTo}
        ${getProfileName(task.createdBy)}
        ${getProfileName(task.completedBy)}
      `.toLowerCase();

      const matchesSearch =
        !search ||
        searchableText.includes(search);

      const matchesDepartment =
        department === "all" ||
        task.department === department;

      const matchesStatus =
        status === "all" ||
        task.status === status;

      const matchesPriority =
        priority === "all" ||
        task.priority === priority;

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

/* =========================================
   RENDER WEBSITE
========================================= */

function renderWebsite() {
  const activeTasks =
    tasks.filter(
      task => !task.archived
    );

  const todoTasks =
    activeTasks.filter(
      task => task.status === "todo"
    );

  const completedTasks =
    activeTasks.filter(
      task => task.status === "completed"
    );

  const archivedTasks =
    tasks.filter(
      task => task.archived
    );

  getElement("totalCount").textContent =
    activeTasks.length;

  getElement("todoCount").textContent =
    todoTasks.length;

  getElement("completedCount").textContent =
    completedTasks.length;

  getElement("highCount").textContent =
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

  getElement("progressPercent").textContent =
    `${completionPercentage}%`;

  getElement("progressRing")
    .style
    .setProperty(
      "--p",
      completionPercentage
    );

  if (!activeTasks.length) {
    getElement("progressText").textContent =
      "No active tasks yet.";
  } else if (completionPercentage === 100) {
    getElement("progressText").textContent =
      "Excellent — every active task is complete.";
  } else {
    getElement("progressText").textContent =
      `${completedTasks.length} of ${activeTasks.length} active tasks completed.`;
  }

  getElement("summaryTodo").textContent =
    todoTasks.length;

  getElement("summaryDone").textContent =
    completedTasks.length;

  const priorityOrder = {
    high: 0,
    medium: 1,
    low: 2
  };

  const dashboardTasks =
    [...todoTasks]
      .sort(
        (firstTask, secondTask) => {
          const firstPriority =
            priorityOrder[firstTask.priority] ?? 3;

          const secondPriority =
            priorityOrder[secondTask.priority] ?? 3;

          if (
            firstPriority !==
            secondPriority
          ) {
            return (
              firstPriority -
              secondPriority
            );
          }

          if (
            firstTask.dueDate &&
            secondTask.dueDate
          ) {
            return firstTask.dueDate
              .localeCompare(
                secondTask.dueDate
              );
          }

          return firstTask.dueDate
            ? -1
            : 1;
        }
      )
      .slice(0, 6);

  renderTaskList(
    "dashboardTaskList",
    dashboardTasks
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
  updateUserDisplay();
}

/* =========================================
   ADD TASK
========================================= */

async function addTask(event) {
  event.preventDefault();

  if (
    !currentUser ||
    !currentProfile
  ) {
    showToast(
      "Please log in again."
    );

    return;
  }

  const title =
    getElement("taskTitle")
      .value
      .trim();

  const description =
    getElement("taskDescription")
      .value
      .trim();

  const department =
    getElement("taskDepartment")
      .value;

  const priority =
    getElement("taskPriority")
      .value;

  const dueDate =
    getElement("taskDueDate")
      .value || null;

  const assignedTo =
    getElement("taskAssignedTo")
      .value
      .trim();

  if (!title) {
    showToast(
      "Please enter a task title."
    );

    return;
  }

  if (!department) {
    showToast(
      "Please choose a department."
    );

    return;
  }

  const submitButton =
    getElement("taskForm")
      .querySelector(
        'button[type="submit"]'
      );

  submitButton.disabled = true;
  submitButton.textContent =
    "Adding Task...";

  const { error } =
    await supabaseClient
      .from("tasks")
      .insert({
        title,
        description:
          description || null,
        department,
        priority,
        due_date:
          dueDate,
        assigned_to:
          assignedTo || null,
        created_by:
          currentUser.id,
        status:
          "todo",
        archived:
          false
      });

  submitButton.disabled = false;
  submitButton.textContent =
    "Add Task";

  if (error) {
    console.error(
      "Task creation error:",
      error
    );

    showToast(
      `Could not add task: ${error.message}`
    );

    return;
  }

  closeTaskModal();

  showToast(
    "Task added successfully."
  );

  await loadTasks();
}

/* =========================================
   COMPLETE TASK
========================================= */

window.completeTask =
  async function(taskId) {
    if (!currentUser) {
      return;
    }

    const confirmed =
      confirm(
        "Mark this task as completed?"
      );

    if (!confirmed) {
      return;
    }

    const { error } =
      await supabaseClient
        .from("tasks")
        .update({
          status:
            "completed",
          completed_by:
            currentUser.id,
          completed_at:
            new Date().toISOString()
        })
        .eq(
          "id",
          taskId
        );

    if (error) {
      console.error(
        "Complete task error:",
        error
      );

      showToast(
        `Could not complete task: ${error.message}`
      );

      return;
    }

    showToast(
      "Task marked as completed."
    );

    await loadTasks();
  };

/* =========================================
   REOPEN TASK
========================================= */

window.reopenTask =
  async function(taskId) {
    if (!canManageTasks()) {
      showToast(
        "Only managers and owners can reopen tasks."
      );

      return;
    }

    const { error } =
      await supabaseClient
        .from("tasks")
        .update({
          status:
            "todo",
          completed_by:
            null,
          completed_at:
            null
        })
        .eq(
          "id",
          taskId
        );

    if (error) {
      console.error(
        "Reopen task error:",
        error
      );

      showToast(
        `Could not reopen task: ${error.message}`
      );

      return;
    }

    showToast(
      "Task reopened."
    );

    await loadTasks();
  };

/* =========================================
   ARCHIVE TASK
========================================= */

window.archiveTask =
  async function(taskId) {
    if (!canManageTasks()) {
      showToast(
        "Only managers and owners can archive tasks."
      );

      return;
    }

    const confirmed =
      confirm(
        "Archive this task?"
      );

    if (!confirmed) {
      return;
    }

    const { error } =
      await supabaseClient
        .from("tasks")
        .update({
          archived: true
        })
        .eq(
          "id",
          taskId
        );

    if (error) {
      console.error(
        "Archive task error:",
        error
      );

      showToast(
        `Could not archive task: ${error.message}`
      );

      return;
    }

    showToast(
      "Task moved to archive."
    );

    await loadTasks();
  };

/* =========================================
   RESTORE TASK
========================================= */

window.restoreTask =
  async function(taskId) {
    if (!canManageTasks()) {
      return;
    }

    const { error } =
      await supabaseClient
        .from("tasks")
        .update({
          archived: false
        })
        .eq(
          "id",
          taskId
        );

    if (error) {
      console.error(
        "Restore task error:",
        error
      );

      showToast(
        `Could not restore task: ${error.message}`
      );

      return;
    }

    showToast(
      "Task restored."
    );

    await loadTasks();
  };

/* =========================================
   DELETE TASK
========================================= */

window.deleteTask =
  async function(taskId) {
    if (!canManageTasks()) {
      showToast(
        "Only managers and owners can delete tasks."
      );

      return;
    }

    const confirmed =
      confirm(
        "Permanently delete this task? This cannot be undone."
      );

    if (!confirmed) {
      return;
    }

    const { error } =
      await supabaseClient
        .from("tasks")
        .delete()
        .eq(
          "id",
          taskId
        );

    if (error) {
      console.error(
        "Delete task error:",
        error
      );

      showToast(
        `Could not delete task: ${error.message}`
      );

      return;
    }

    showToast(
      "Task permanently deleted."
    );

    await loadTasks();
  };

/* =========================================
   TASK MODAL
========================================= */

function openTaskModal() {
  showElement("taskModal");

  getElement("taskTitle")
    .focus();
}

function closeTaskModal() {
  hideElement("taskModal");

  getElement("taskForm")
    .reset();

  getElement("taskPriority").value =
    "medium";
}

/* =========================================
   NAVIGATION
========================================= */

function switchView(viewName) {
  if (
    viewName === "archive" &&
    !canManageTasks()
  ) {
    showToast(
      "Only managers and owners can access the archive."
    );

    return;
  }

  currentView = viewName;

  const pageTitles = {
    dashboard:
      "Dashboard",
    planner:
      "Weekly Planner",
    tasks:
      "All Tasks",
    completed:
      "Completed Tasks",
    archive:
      "Archive"
  };

  document
    .querySelectorAll(".view")
    .forEach(view => {
      view.classList.remove(
        "active"
      );
    });

  document
    .querySelectorAll(".nav-link")
    .forEach(button => {
      button.classList.remove(
        "active"
      );
    });

  getElement(`${viewName}View`)
    ?.classList
    .add("active");

  document
    .querySelector(
      `[data-view="${viewName}"]`
    )
    ?.classList
    .add("active");

  getElement("pageTitle").textContent =
    pageTitles[viewName] ||
    "StoreFlow";

  getElement("sidebar")
    .classList
    .remove("open");

  getElement("mobileOverlay")
    .classList
    .remove("show");
}

/* =========================================
   REALTIME TASK UPDATES
========================================= */

function subscribeToTaskChanges() {
  if (realtimeChannel) {
    supabaseClient.removeChannel(
      realtimeChannel
    );
  }

  realtimeChannel =
    supabaseClient
      .channel(
        "storeflow-task-changes"
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks"
        },
        async () => {
          await loadTasks();
        }
      )
      .subscribe(status => {
        console.log(
          "Realtime status:",
          status
        );
      });
}

/* =========================================
   SHOW APPLICATION
========================================= */

async function showStoreflowApp(user) {
  if (
    isInitialising &&
    currentUser?.id === user.id
  ) {
    return;
  }

  isInitialising = true;
  currentUser = user;

  try {
    const profileLoaded =
      await loadCurrentProfile();

    if (!profileLoaded) {
      return;
    }

    await loadProfiles();
    await loadTasks();

    setGreeting();
    updateUserDisplay();
    subscribeToTaskChanges();

    hideElement("loginScreen");
    showElement("storeflowApp");
  } finally {
    isInitialising = false;
  }
}

function showLoginScreen() {
  currentUser = null;
  currentProfile = null;

  tasks = [];
  profiles = [];

  if (realtimeChannel) {
    supabaseClient.removeChannel(
      realtimeChannel
    );

    realtimeChannel = null;
  }

  hideElement("storeflowApp");
  showElement("loginScreen");

  const loginForm =
    getElement("loginForm");

  if (loginForm) {
    loginForm.reset();
  }

  const loginError =
    getElement("loginError");

  if (loginError) {
    loginError.textContent = "";
    loginError.classList.add("hidden");
  }
}

/* =========================================
   TOAST MESSAGE
========================================= */

function showToast(message) {
  const toast =
    getElement("toast");

  if (!toast) {
    return;
  }

  toast.textContent = message;

  toast.classList.remove(
    "hidden"
  );

  clearTimeout(toastTimer);

  toastTimer =
    setTimeout(() => {
      toast.classList.add(
        "hidden"
      );
    }, 3000);
}

/* =========================================
   EVENT LISTENERS
========================================= */

getElement("loginForm")
  ?.addEventListener(
    "submit",
    signIn
  );

getElement("logoutButton")
  ?.addEventListener(
    "click",
    signOut
  );

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
  .querySelectorAll(
    "[data-go-view]"
  )
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

document
  .querySelectorAll(
    ".open-task-modal"
  )
  .forEach(button => {
    button.addEventListener(
      "click",
      openTaskModal
    );
  });

getElement("closeModal")
  ?.addEventListener(
    "click",
    closeTaskModal
  );

getElement("cancelModal")
  ?.addEventListener(
    "click",
    closeTaskModal
  );

getElement("taskModal")
  ?.addEventListener(
    "click",
    event => {
      if (
        event.target.id ===
        "taskModal"
      ) {
        closeTaskModal();
      }
    }
  );

getElement("taskForm")
  ?.addEventListener(
    "submit",
    addTask
  );

getElement("searchInput")
  ?.addEventListener(
    "input",
    renderFilteredTasks
  );

getElement("departmentFilter")
  ?.addEventListener(
    "change",
    renderFilteredTasks
  );

getElement("statusFilter")
  ?.addEventListener(
    "change",
    renderFilteredTasks
  );

getElement("priorityFilter")
  ?.addEventListener(
    "change",
    renderFilteredTasks
  );

getElement("menuButton")
  ?.addEventListener(
    "click",
    () => {
      getElement("sidebar")
        .classList
        .toggle("open");

      getElement("mobileOverlay")
        .classList
        .toggle("show");
    }
  );

getElement("mobileOverlay")
  ?.addEventListener(
    "click",
    () => {
      getElement("sidebar")
        .classList
        .remove("open");

      getElement("mobileOverlay")
        .classList
        .remove("show");
    }
  );

document.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Escape" &&
      !getElement("taskModal")
        ?.classList
        .contains("hidden")
    ) {
      closeTaskModal();
    }
  }
);

/* =========================================
   AUTHENTICATION STATE
========================================= */

supabaseClient.auth
  .onAuthStateChange(
    async (
      event,
      session
    ) => {
      console.log(
        "Authentication event:",
        event
      );

      if (session?.user) {
        await showStoreflowApp(
          session.user
        );
      } else {
        showLoginScreen();
      }
    }
  );

/* =========================================
   INITIALISE STOREFLOW
========================================= */

async function initialiseStoreflow() {
  const {
    data: {
      session
    },
    error
  } =
    await supabaseClient.auth
      .getSession();

  if (error) {
    console.error(
      "Session loading error:",
      error
    );

    showLoginScreen();

    return;
  }

  if (session?.user) {
    await showStoreflowApp(
      session.user
    );
  } else {
    showLoginScreen();
  }
}

initialiseStoreflow();