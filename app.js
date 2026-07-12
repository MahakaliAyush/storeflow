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

let tasks = [];
let profiles = [];
let currentUser = null;
let currentProfile = null;
let currentView = "dashboard";
let realtimeChannel = null;
let toastTimer = null;

function getElement(id) {
  return document.getElementById(id);
}

function showElement(id) {
  getElement(id)?.classList.remove("hidden");
}

function hideElement(id) {
  getElement(id)?.classList.add("hidden");
}

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

  const profile =
    profiles.find(
      item => item.id === userId
    );

  return (
    profile?.full_name ||
    "Staff member"
  );
}

function getInitials(name = "") {
  const words =
    name
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

function setGreeting() {
  const hour =
    new Date().getHours();

  let greeting =
    "Good evening";

  if (hour < 12) {
    greeting =
      "Good morning";
  } else if (hour < 17) {
    greeting =
      "Good afternoon";
  }

  const firstName =
    currentProfile?.full_name
      ?.trim()
      ?.split(" ")[0] ||
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

async function signIn(event) {
  event.preventDefault();

  const email =
    getElement("loginEmail")
      .value
      .trim();

  const password =
    getElement("loginPassword")
      .value;

  const button =
    getElement("loginButton");

  const errorBox =
    getElement("loginError");

  errorBox.textContent = "";
  errorBox.classList.add("hidden");

  button.textContent =
    "Signing In...";

  button.classList.add(
    "loading-button"
  );

  const { error } =
    await supabaseClient.auth
      .signInWithPassword({
        email,
        password
      });

  button.textContent =
    "Sign In";

  button.classList.remove(
    "loading-button"
  );

  if (error) {
    errorBox.textContent =
      error.message;

    errorBox.classList.remove(
      "hidden"
    );
  }
}

async function signOut() {
  const { error } =
    await supabaseClient.auth
      .signOut();

  if (error) {
    showToast(error.message);
  }
}

async function loadCurrentProfile() {
  const { data, error } =
    await supabaseClient
      .from("profiles")
      .select(
        "id, full_name, role, active"
      )
      .eq(
        "id",
        currentUser.id
      )
      .single();

  if (error) {
    console.error(error);

    showToast(
      "Your profile could not be loaded."
    );

    return false;
  }

  if (!data.active) {
    await signOut();

    showToast(
      "Your StoreFlow account is inactive."
    );

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
    currentProfile?.role ||
    "staff";

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
}

async function loadProfiles() {
  const { data, error } =
    await supabaseClient
      .from("profiles")
      .select(
        "id, full_name, role, active"
      )
      .eq(
        "active",
        true
      )
      .order("full_name");

  if (error) {
    console.error(error);
    profiles = [];
    return;
  }

  profiles = data || [];
}

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
    console.error(error);

    showToast(
      `Could not load tasks: ${error.message}`
    );

    return;
  }

  tasks =
    (data || []).map(task => ({
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

function createTaskCard(task) {
  const createdByName =
    getProfileName(
      task.createdBy
    );

  const completedByName =
    getProfileName(
      task.completedBy
    );

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
        ${restoreButtons}

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

  const today =
    new Date();

  const startOfWeek =
    new Date(today);

  startOfWeek.setDate(
    today.getDate() -
    today.getDay()
  );

  getElement("weekBoard").innerHTML =
    days.map(
      (dayName, index) => {
        const date =
          new Date(startOfWeek);

        date.setDate(
          startOfWeek.getDate() +
          index
        );

        const dateKey =
          date
            .toISOString()
            .slice(0, 10);

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
              ${taskHtml}
            </div>

          </section>
        `;
      }
    ).join("");
}

function renderFilteredTasks() {
  const search =
    getElement("searchInput")
      .value
      .trim()
      .toLowerCase();

  const department =
    getElement("departmentFilter")
      .value;

  const status =
    getElement("statusFilter")
      .value;

  const priority =
    getElement("priorityFilter")
      .value;

  const filteredTasks =
    tasks.filter(task => {
      if (task.archived) {
        return false;
      }

      const searchableText = `
        ${task.title}
        ${task.description}
        ${task.assignedTo}
        ${getProfileName(task.createdBy)}
        ${getProfileName(task.completedBy)}
      `.toLowerCase();

      return (
        (
          !search ||
          searchableText.includes(search)
        ) &&
        (
          department === "all" ||
          task.department === department
        ) &&
        (
          status === "all" ||
          task.status === status
        ) &&
        (
          priority === "all" ||
          task.priority === priority
        )
      );
    });

  renderTaskList(
    "allTaskList",
    filteredTasks
  );
}

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

  const percentage =
    activeTasks.length
      ? Math.round(
          (
            completedTasks.length /
            activeTasks.length
          ) * 100
        )
      : 0;

  getElement("progressPercent").textContent =
    `${percentage}%`;

  getElement("progressRing")
    .style
    .setProperty(
      "--p",
      percentage
    );

  getElement("progressText").textContent =
    activeTasks.length === 0
      ? "No active tasks yet."
      : percentage === 100
        ? "Excellent — every active task is complete."
        : `${completedTasks.length} of ${activeTasks.length} active tasks completed.`;

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
        (first, second) =>
          priorityOrder[first.priority] -
          priorityOrder[second.priority]
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
}

async function addTask(event) {
  event.preventDefault();

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

  if (error) {
    console.error(error);

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

window.completeTask =
  async function(taskId) {
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

window.reopenTask =
  async function(taskId) {
    if (!canManageTasks()) {
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
      showToast(error.message);
      return;
    }

    showToast(
      "Task reopened."
    );

    await loadTasks();
  };

window.archiveTask =
  async function(taskId) {
    if (!canManageTasks()) {
      return;
    }

    if (
      !confirm(
        "Archive this task?"
      )
    ) {
      return;
    }

    const { error } =
      await supabaseClient
        .from("tasks")
        .update({
          archived:
            true
        })
        .eq(
          "id",
          taskId
        );

    if (error) {
      showToast(error.message);
      return;
    }

    showToast(
      "Task moved to archive."
    );

    await loadTasks();
  };

window.restoreTask =
  async function(taskId) {
    if (!canManageTasks()) {
      return;
    }

    const { error } =
      await supabaseClient
        .from("tasks")
        .update({
          archived:
            false
        })
        .eq(
          "id",
          taskId
        );

    if (error) {
      showToast(error.message);
      return;
    }

    showToast(
      "Task restored."
    );

    await loadTasks();
  };

window.deleteTask =
  async function(taskId) {
    if (!canManageTasks()) {
      return;
    }

    if (
      !confirm(
        "Permanently delete this task?"
      )
    ) {
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
      showToast(error.message);
      return;
    }

    showToast(
      "Task permanently deleted."
    );

    await loadTasks();
  };

function openTaskModal() {
  showElement("taskModal");

  getElement("taskTitle").focus();
}

function closeTaskModal() {
  hideElement("taskModal");

  getElement("taskForm").reset();

  getElement("taskPriority").value =
    "medium";
}

function switchView(viewName) {
  if (
    viewName === "archive" &&
    !canManageTasks()
  ) {
    return;
  }

  currentView =
    viewName;

  const titles = {
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
      view.classList.remove("active");
    });

  document
    .querySelectorAll(".nav-link")
    .forEach(button => {
      button.classList.remove("active");
    });

  getElement(`${viewName}View`)
    .classList
    .add("active");

  document
    .querySelector(
      `[data-view="${viewName}"]`
    )
    ?.classList
    .add("active");

  getElement("pageTitle").textContent =
    titles[viewName];

  getElement("sidebar")
    .classList
    .remove("open");

  getElement("mobileOverlay")
    .classList
    .remove("show");
}

function subscribeToTaskChanges() {
  if (realtimeChannel) {
    supabaseClient
      .removeChannel(
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
          event:
            "*",
          schema:
            "public",
          table:
            "tasks"
        },
        async () => {
          await loadTasks();
        }
      )
      .subscribe();
}

async function showStoreflowApp(user) {
  currentUser =
    user;

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
}

function showLoginScreen() {
  currentUser =
    null;

  currentProfile =
    null;

  tasks =
    [];

  profiles =
    [];

  if (realtimeChannel) {
    supabaseClient
      .removeChannel(
        realtimeChannel
      );

    realtimeChannel =
      null;
  }

  hideElement("storeflowApp");
  showElement("loginScreen");

  getElement("loginForm").reset();
}

function showToast(message) {
  const toast =
    getElement("toast");

  toast.textContent =
    message;

  toast.classList.remove(
    "hidden"
  );

  clearTimeout(
    toastTimer
  );

  toastTimer =
    setTimeout(() => {
      toast.classList.add(
        "hidden"
      );
    }, 3000);
}

getElement("loginForm")
  .addEventListener(
    "submit",
    signIn
  );

getElement("logoutButton")
  .addEventListener(
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

document
  .querySelectorAll(".open-task-modal")
  .forEach(button => {
    button.addEventListener(
      "click",
      openTaskModal
    );
  });

getElement("closeModal")
  .addEventListener(
    "click",
    closeTaskModal
  );

getElement("cancelModal")
  .addEventListener(
    "click",
    closeTaskModal
  );

getElement("taskModal")
  .addEventListener(
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
  .addEventListener(
    "submit",
    addTask
  );

getElement("searchInput")
  .addEventListener(
    "input",
    renderFilteredTasks
  );

getElement("departmentFilter")
  .addEventListener(
    "change",
    renderFilteredTasks
  );

getElement("statusFilter")
  .addEventListener(
    "change",
    renderFilteredTasks
  );

getElement("priorityFilter")
  .addEventListener(
    "change",
    renderFilteredTasks
  );

getElement("menuButton")
  .addEventListener(
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
  .addEventListener(
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

supabaseClient.auth
  .onAuthStateChange(
    async (
      event,
      session
    ) => {
      if (session?.user) {
        await showStoreflowApp(
          session.user
        );
      } else {
        showLoginScreen();
      }
    }
  );

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
    console.error(error);
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