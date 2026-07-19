/* =========================================
   STOREFLOW — SUPABASE V7
   RECURRING TASKS + PRIVATE PHOTO EVIDENCE
========================================= */

const supabaseClient = window.supabase.createClient(
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
let activityLogs = [];
let recurringSchedules = [];
let taskEvidence = [];

let currentUser = null;
let currentProfile = null;
let currentView = "dashboard";
let currentEvidenceTaskId = null;
let selectedEvidenceFile = null;
let evidencePreviewUrl = null;

let realtimeChannel = null;
let toastTimer = null;
let isInitialising = false;

/* =========================================
   BASIC HELPERS
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

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, character => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return replacements[character];
  });
}

function canManageTasks() {
  return (
    currentProfile?.role === "manager" ||
    currentProfile?.role === "owner"
  );
}

function formatRole(role) {
  if (role === "owner") return "Store Owner";
  if (role === "manager") return "Manager";
  return "Staff";
}

function getProfileName(userId) {
  if (!userId) return "System";

  const profile = profiles.find(item => item.id === userId);

  return profile?.full_name || "Former staff member";
}

function getAssignedProfileName(task) {
  if (!task.assignedToUserId) return "Anyone";

  const profile = profiles.find(
    item => item.id === task.assignedToUserId
  );

  return (
    profile?.full_name ||
    task.assignedTo ||
    "Staff member"
  );
}

function getInitials(name = "") {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "SF";

  return words
    .slice(0, 2)
    .map(word => word[0].toUpperCase())
    .join("");
}

function getEvidenceForTask(taskId) {
  return (
    taskEvidence.find(
      item => item.taskId === taskId
    ) || null
  );
}

function canActOnTask(task) {
  if (!currentUser || !task) return false;

  return (
    canManageTasks() ||
    !task.assignedToUserId ||
    task.assignedToUserId === currentUser.id
  );
}

function sanitiseFileName(fileName = "photo") {
  const cleaned = String(fileName)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned || "photo";
}

function bytesToDisplay(bytes) {
  if (!Number.isFinite(bytes)) return "";

  if (bytes < 1024 * 1024) {
    return `${Math.max(
      1,
      Math.round(bytes / 1024)
    )} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(2)} MB`;
}

/* =========================================
   DATE HELPERS
========================================= */

function formatDate(value) {
  if (!value) return "No due date";

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
  if (!value) return "";

  return new Intl.DateTimeFormat(
    "en-AU",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
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

function isToday(value) {
  if (!value) return false;

  return (
    getLocalDateKey(new Date(value)) ===
    getLocalDateKey(new Date())
  );
}

function calculateNextDueDate(
  dueDate,
  repeatType
) {
  const date = new Date(
    `${dueDate}T00:00:00`
  );

  if (repeatType === "daily") {
    date.setDate(
      date.getDate() + 1
    );
  } else if (repeatType === "weekly") {
    date.setDate(
      date.getDate() + 7
    );
  } else if (repeatType === "monthly") {
    const originalDay = date.getDate();

    date.setDate(1);

    date.setMonth(
      date.getMonth() + 1
    );

    const lastDay = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0
    ).getDate();

    date.setDate(
      Math.min(
        originalDay,
        lastDay
      )
    );
  }

  return getLocalDateKey(date);
}

function setGreeting() {
  const hour = new Date().getHours();

  let greeting = "Good evening";

  if (hour < 12) {
    greeting = "Good morning";
  } else if (hour < 17) {
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
   AUTHENTICATION
========================================= */

async function signIn(event) {
  event.preventDefault();

  const username =
    getElement("loginUsername")
      .value
      .trim()
      .toLowerCase();

  const password =
    getElement("loginPassword").value;

  const loginButton =
    getElement("loginButton");

  const loginError =
    getElement("loginError");

  loginError.textContent = "";

  loginError.classList.add(
    "hidden"
  );

  if (
    !/^[a-z0-9._-]+$/.test(username)
  ) {
    loginError.textContent =
      "Username can only contain letters, numbers, dots, dashes and underscores.";

    loginError.classList.remove(
      "hidden"
    );

    return;
  }

  loginButton.textContent =
    "Signing In...";

  loginButton.disabled = true;

  loginButton.classList.add(
    "loading-button"
  );

  try {
    const { error } =
      await supabaseClient.auth
        .signInWithPassword({
          email:
            `${username}@storeflow.internal`,

          password
        });

    if (error) throw error;
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

    loginButton.disabled = false;

    loginButton.classList.remove(
      "loading-button"
    );
  }
}

async function signOut() {
  const logoutButton =
    getElement("logoutButton");

  logoutButton.disabled = true;

  logoutButton.textContent =
    "Logging Out...";

  const { error } =
    await supabaseClient.auth
      .signOut();

  logoutButton.disabled = false;

  logoutButton.textContent =
    "Log Out";

  if (error) {
    showToast(
      `Could not log out: ${error.message}`
    );
  }
}

/* =========================================
   PROFILE DATA
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
      .eq(
        "id",
        currentUser.id
      )
      .single();

  if (error) {
    console.error(
      "Profile loading error:",
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

    await supabaseClient.auth
      .signOut();

    return false;
  }

  currentProfile = data;

  updateUserDisplay();

  return true;
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
      .order(
        "full_name",
        {
          ascending: true
        }
      );

  if (error) {
    console.error(
      "Profiles loading error:",
      error
    );

    profiles = [];

    return;
  }

  profiles = data || [];
}

function updateUserDisplay() {
  const fullName =
    currentProfile?.full_name ||
    "Staff Member";

  getElement(
    "signedInName"
  ).textContent =
    fullName;

  getElement(
    "signedInRole"
  ).textContent =
    formatRole(
      currentProfile?.role
    );

  getElement(
    "userAvatar"
  ).textContent =
    getInitials(fullName);

  document
    .querySelectorAll(
      [
        '[data-view="archive"]',
        '[data-view="staffOverview"]',
        '[data-view="activityLog"]',
        '[data-view="recurringTasks"]'
      ].join(",")
    )
    .forEach(button => {
      button.style.display =
        canManageTasks()
          ? ""
          : "none";
    });

  const protectedViews = [
    "archive",
    "staffOverview",
    "activityLog",
    "recurringTasks"
  ];

  if (
    protectedViews.includes(
      currentView
    ) &&
    !canManageTasks()
  ) {
    switchView(
      "dashboard"
    );
  }

  updateRepeatFields();
}

function populateAssigneeDropdown() {
  const select =
    getElement(
      "taskAssignedTo"
    );

  if (!select) return;

  const oldValue =
    select.value;

  const options =
    profiles
      .map(profile => {
        return `
          <option value="${escapeHtml(
            profile.id
          )}">
            ${escapeHtml(
              profile.full_name
            )}
            —
            ${escapeHtml(
              formatRole(
                profile.role
              )
            )}
          </option>
        `;
      })
      .join("");

  select.innerHTML = `
    <option value="">
      Anyone
    </option>

    ${options}
  `;

  select.value =
    profiles.some(
      profile =>
        profile.id === oldValue
    )
      ? oldValue
      : "";
}

/* =========================================
   TASK, RECURRING AND EVIDENCE DATA
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

  tasks =
    (data || []).map(task => ({
      id:
        task.id,

      title:
        task.title,

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

      assignedToUserId:
        task.assigned_to_user_id || "",

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
        task.archived,

      recurringScheduleId:
        task.recurring_schedule_id || "",

      photoRequired:
        Boolean(
          task.photo_required
        )
    }));

  renderWebsite();
}

async function loadRecurringSchedules() {
  if (!currentUser) {
    recurringSchedules = [];

    renderRecurringSchedules();

    return;
  }

  const { data, error } =
    await supabaseClient
      .from(
        "recurring_schedules"
      )
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      );

  if (error) {
    console.error(
      "Recurring schedule loading error:",
      error
    );

    recurringSchedules = [];

    if (canManageTasks()) {
      showToast(
        `Could not load recurring tasks: ${error.message}`
      );
    }

    return;
  }

  recurringSchedules =
    (data || []).map(schedule => ({
      id:
        schedule.id,

      title:
        schedule.title,

      description:
        schedule.description || "",

      department:
        schedule.department,

      priority:
        schedule.priority,

      assignedTo:
        schedule.assigned_to || "",

      assignedToUserId:
        schedule.assigned_to_user_id || "",

      createdBy:
        schedule.created_by,

      repeatType:
        schedule.repeat_type,

      nextDueDate:
        schedule.next_due_date,

      active:
        schedule.active,

      photoRequired:
        Boolean(
          schedule.photo_required
        ),

      createdAt:
        schedule.created_at,

      updatedAt:
        schedule.updated_at
    }));

  renderRecurringSchedules();
}

async function loadTaskEvidence() {
  if (!currentUser) {
    taskEvidence = [];

    renderWebsite();

    return;
  }

  const { data, error } =
    await supabaseClient
      .from("task_evidence")
      .select(
        "id, task_id, storage_path, original_file_name, mime_type, file_size_bytes, uploaded_by, uploaded_at"
      )
      .order(
        "uploaded_at",
        {
          ascending: false
        }
      );

  if (error) {
    console.error(
      "Evidence loading error:",
      error
    );

    taskEvidence = [];

    showToast(
      `Could not load photo evidence: ${error.message}`
    );

    return;
  }

  taskEvidence =
    (data || []).map(item => ({
      id:
        item.id,

      taskId:
        item.task_id,

      storagePath:
        item.storage_path,

      originalFileName:
        item.original_file_name,

      mimeType:
        item.mime_type,

      fileSizeBytes:
        Number(
          item.file_size_bytes || 0
        ),

      uploadedBy:
        item.uploaded_by,

      uploadedAt:
        item.uploaded_at
    }));

  renderWebsite();
}

async function loadActivityLogs() {
  if (!canManageTasks()) {
    activityLogs = [];

    renderActivityLog();

    return;
  }

  const { data, error } =
    await supabaseClient
      .from("activity_logs")
      .select(
        "id, user_id, task_id, action, details, created_at"
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(300);

  if (error) {
    console.error(
      "Activity log loading error:",
      error
    );

    activityLogs = [];

    showToast(
      `Could not load activity log: ${error.message}`
    );

    return;
  }

  activityLogs =
    (data || []).map(log => ({
      id:
        log.id,

      userId:
        log.user_id,

      taskId:
        log.task_id,

      action:
        log.action,

      details:
        log.details ||
        "Untitled task",

      createdAt:
        log.created_at
    }));

  renderActivityLog();
}

/* =========================================
   TASK SORTING AND CARDS
========================================= */

function sortTasks(taskList) {
  const priorityOrder = {
    high: 0,
    medium: 1,
    low: 2
  };

  return [...taskList].sort(
    (
      firstTask,
      secondTask
    ) => {
      if (
        firstTask.status !==
        secondTask.status
      ) {
        return firstTask.status ===
          "todo"
          ? -1
          : 1;
      }

      const firstPriority =
        priorityOrder[
          firstTask.priority
        ] ?? 3;

      const secondPriority =
        priorityOrder[
          secondTask.priority
        ] ?? 3;

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

      if (firstTask.dueDate) {
        return -1;
      }

      if (secondTask.dueDate) {
        return 1;
      }

      return 0;
    }
  );
}

function getRepeatLabel(repeatType) {
  const labels = {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly"
  };

  return (
    labels[repeatType] ||
    "Recurring"
  );
}

function getScheduleForTask(task) {
  if (
    !task.recurringScheduleId
  ) {
    return null;
  }

  return (
    recurringSchedules.find(
      schedule =>
        schedule.id ===
        task.recurringScheduleId
    ) || null
  );
}

function createTaskCard(task) {
  const evidence =
    getEvidenceForTask(
      task.id
    );

  const recurringSchedule =
    getScheduleForTask(task);

  const assignedToName =
    getAssignedProfileName(task);

  const createdByName =
    getProfileName(
      task.createdBy
    );

  const completedByName =
    getProfileName(
      task.completedBy
    );

  const allowedToAct =
    canActOnTask(task);

  const uploadButton =
    allowedToAct &&
    task.status === "todo" &&
    !task.archived
      ? `
        <button
          class="${
            evidence
              ? "secondary-button"
              : "evidence-button"
          }"
          onclick="openEvidenceUpload('${task.id}')"
        >
          📷 ${
            evidence
              ? "Replace Photo"
              : "Upload Photo"
          }
        </button>
      `
      : "";

  const viewButton =
    evidence
      ? `
        <button
          class="secondary-button"
          onclick="viewTaskEvidence('${task.id}')"
        >
          View Evidence
        </button>
      `
      : "";

  const canComplete =
    task.status === "todo" &&
    !task.archived &&
    allowedToAct &&
    (
      !task.photoRequired ||
      Boolean(evidence)
    );

  const completeButton =
    canComplete
      ? `
        <button
          class="success-button"
          onclick="completeTask('${task.id}')"
        >
          ✓ Mark as Done
        </button>
      `
      : "";

  const evidenceWarning =
    task.status === "todo" &&
    task.photoRequired &&
    !evidence &&
    allowedToAct
      ? `
        <span class="task-action-message">
          Upload the required photo before completing this task.
        </span>
      `
      : "";

  const reopenButton =
    task.status ===
      "completed" &&
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

  const archiveControls =
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

          ${
            task.recurringScheduleId
              ? `
                <span class="badge recurring-badge">
                  ↻ ${escapeHtml(
                    getRepeatLabel(
                      recurringSchedule?.repeatType
                    )
                  )}
                </span>
              `
              : ""
          }

          ${
            task.photoRequired
              ? evidence
                ? `
                  <span class="badge evidence-attached-badge">
                    📷 PHOTO ATTACHED
                  </span>
                `
                : `
                  <span class="badge evidence-required-badge">
                    📷 PHOTO REQUIRED
                  </span>
                `
              : evidence
                ? `
                  <span class="badge evidence-attached-badge">
                    📷 PHOTO ATTACHED
                  </span>
                `
                : ""
          }

          <span class="badge">
            ${
              task.status ===
              "completed"
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
          👤 ${escapeHtml(assignedToName)}
        </span>

        <span>
          ＋ ${escapeHtml(createdByName)}
        </span>

        ${
          evidence
            ? `
              <span>
                📷 ${escapeHtml(
                  getProfileName(
                    evidence.uploadedBy
                  )
                )}
                ·
                ${formatDateTime(
                  evidence.uploadedAt
                )}
              </span>
            `
            : ""
        }

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
        ${uploadButton}
        ${viewButton}
        ${completeButton}
        ${reopenButton}
        ${archiveButton}
        ${archiveControls}
        ${evidenceWarning}
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

  if (!element) return;

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
   STANDARD TASK VIEWS
========================================= */

function renderMyTasks() {
  if (!currentUser) {
    renderTaskList(
      "myTaskList",
      []
    );

    return;
  }

  const myTasks =
    tasks.filter(task => {
      if (task.archived) {
        return false;
      }

      return (
        !task.assignedToUserId ||
        task.assignedToUserId ===
          currentUser.id
      );
    });

  renderTaskList(
    "myTaskList",
    sortTasks(myTasks)
  );
}

function renderWeeklyPlanner() {
  const board =
    getElement("weekBoard");

  if (!board) return;

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

  board.innerHTML =
    days
      .map(
        (
          dayName,
          index
        ) => {
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
              ? sortTasks(dayTasks)
                  .map(task => {
                    const evidence =
                      getEvidenceForTask(
                        task.id
                      );

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
                          ${escapeHtml(
                            getAssignedProfileName(task)
                          )}
                          ·
                          ${escapeHtml(task.priority)}

                          ${
                            task.recurringScheduleId
                              ? " · ↻ Recurring"
                              : ""
                          }

                          ${
                            task.photoRequired
                              ? " · 📷 Required"
                              : evidence
                                ? " · 📷 Attached"
                                : ""
                          }
                        </p>

                      </div>
                    `;
                  })
                  .join("")
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
                  ${date.toLocaleDateString(
                    "en-AU",
                    {
                      day: "numeric",
                      month: "short"
                    }
                  )}
                </small>

              </div>

              <div class="day-tasks">
                ${taskHtml}
              </div>

            </section>
          `;
        }
      )
      .join("");
}

function renderFilteredTasks() {
  const searchInput =
    getElement("searchInput");

  const departmentFilter =
    getElement(
      "departmentFilter"
    );

  const statusFilter =
    getElement("statusFilter");

  const priorityFilter =
    getElement(
      "priorityFilter"
    );

  if (
    !searchInput ||
    !departmentFilter ||
    !statusFilter ||
    !priorityFilter
  ) {
    return;
  }

  const search =
    searchInput.value
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

      const evidence =
        getEvidenceForTask(
          task.id
        );

      const searchableText = `
        ${task.title}
        ${task.description}
        ${task.department}
        ${task.assignedTo}
        ${getAssignedProfileName(task)}
        ${getProfileName(task.createdBy)}
        ${getProfileName(task.completedBy)}
        ${
          task.recurringScheduleId
            ? "recurring repeat"
            : ""
        }
        ${
          task.photoRequired
            ? "photo required evidence"
            : ""
        }
        ${
          evidence
            ? "photo attached uploaded evidence"
            : ""
        }
      `.toLowerCase();

      return (
        (
          !search ||
          searchableText.includes(
            search
          )
        ) &&
        (
          department === "all" ||
          task.department ===
            department
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
    sortTasks(filteredTasks)
  );
}

/* =========================================
   STAFF OVERVIEW
========================================= */

function calculateStaffMetrics(
  profile
) {
  const assignedTasks =
    tasks.filter(task => {
      return (
        !task.archived &&
        task.assignedToUserId ===
          profile.id
      );
    });

  const openTasks =
    assignedTasks.filter(
      task =>
        task.status === "todo"
    );

  const completedTasks =
    assignedTasks.filter(
      task =>
        task.status ===
        "completed"
    );

  const highPriorityTasks =
    openTasks.filter(
      task =>
        task.priority === "high"
    );

  const evidenceRequiredOpen =
    openTasks.filter(task => {
      return (
        task.photoRequired &&
        !getEvidenceForTask(
          task.id
        )
      );
    });

  const completionRate =
    assignedTasks.length
      ? Math.round(
          (
            completedTasks.length /
            assignedTasks.length
          ) * 100
        )
      : 0;

  return {
    total:
      assignedTasks.length,

    open:
      openTasks.length,

    completed:
      completedTasks.length,

    highPriority:
      highPriorityTasks.length,

    evidenceRequiredOpen:
      evidenceRequiredOpen.length,

    completionRate
  };
}

function renderStaffOverview() {
  const summary =
    getElement(
      "staffOverviewSummary"
    );

  const grid =
    getElement(
      "staffOverviewGrid"
    );

  if (!summary || !grid) return;

  if (!canManageTasks()) {
    summary.innerHTML = "";
    grid.innerHTML = "";

    return;
  }

  const activeTasks =
    tasks.filter(
      task => !task.archived
    );

  const openAssignedTasks =
    activeTasks.filter(task => {
      return (
        task.status === "todo" &&
        task.assignedToUserId
      );
    });

  const completedAssignedTasks =
    activeTasks.filter(task => {
      return (
        task.status === "completed" &&
        task.assignedToUserId
      );
    });

  const unassignedTasks =
    activeTasks.filter(
      task =>
        !task.assignedToUserId
    );

  const missingEvidence =
    activeTasks.filter(task => {
      return (
        task.status === "todo" &&
        task.photoRequired &&
        !getEvidenceForTask(
          task.id
        )
      );
    });

  summary.innerHTML = `
    <article class="stat-card">

      <div class="stat-icon red">
        01
      </div>

      <div>
        <p>
          Open assigned
        </p>

        <strong>
          ${openAssignedTasks.length}
        </strong>

        <small>
          Assigned tasks still pending
        </small>
      </div>

    </article>

    <article class="stat-card">

      <div class="stat-icon green">
        02
      </div>

      <div>
        <p>
          Completed assigned
        </p>

        <strong>
          ${completedAssignedTasks.length}
        </strong>

        <small>
          Finished assigned tasks
        </small>
      </div>

    </article>

    <article class="stat-card">

      <div class="stat-icon amber">
        03
      </div>

      <div>
        <p>
          Unassigned tasks
        </p>

        <strong>
          ${unassignedTasks.length}
        </strong>

        <small>
          Available to everyone
        </small>
      </div>

    </article>

    <article class="stat-card">

      <div class="stat-icon dark">
        04
      </div>

      <div>
        <p>
          Photos outstanding
        </p>

        <strong>
          ${missingEvidence.length}
        </strong>

        <small>
          Required evidence not uploaded
        </small>
      </div>

    </article>
  `;

  const overviewProfiles =
    profiles.filter(
      profile =>
        profile.role !== "owner"
    );

  if (!overviewProfiles.length) {
    grid.innerHTML = `
      <div class="empty-state">

        <strong>
          No staff profiles found
        </strong>

        Active staff profiles will appear here.

      </div>
    `;

    return;
  }

  grid.innerHTML =
    overviewProfiles
      .map(profile => {
        const metrics =
          calculateStaffMetrics(
            profile
          );

        return `
          <article class="task-card">

            <div class="task-top">

              <div>

                <h4>
                  ${escapeHtml(profile.full_name)}
                </h4>

                <p class="task-description">
                  ${escapeHtml(
                    formatRole(
                      profile.role
                    )
                  )}
                </p>

              </div>

              <div class="badges">

                <span class="badge">
                  ${metrics.completionRate}% COMPLETE
                </span>

                <span class="badge">
                  ${metrics.total} ASSIGNED
                </span>

              </div>

            </div>

            <div class="task-meta">

              <span>
                📋 ${metrics.open} open
              </span>

              <span>
                ✅ ${metrics.completed} completed
              </span>

              <span>
                ⚠ ${metrics.highPriority} high priority
              </span>

              <span>
                📷 ${metrics.evidenceRequiredOpen} photos outstanding
              </span>

            </div>

          </article>
        `;
      })
      .join("");
}

/* =========================================
   RECURRING TASKS
========================================= */

function createRecurringScheduleCard(
  schedule
) {
  const assignedName =
    schedule.assignedToUserId
      ? getProfileName(
          schedule.assignedToUserId
        )
      : "Anyone";

  const statusBadge =
    schedule.active
      ? `
        <span class="badge schedule-active">
          ACTIVE
        </span>
      `
      : `
        <span class="badge schedule-paused">
          PAUSED
        </span>
      `;

  const controlButton =
    schedule.active
      ? `
        <button
          type="button"
          class="danger-button"
          onclick="pauseRecurringSchedule('${schedule.id}')"
        >
          Pause Schedule
        </button>
      `
      : `
        <button
          type="button"
          class="success-button"
          onclick="resumeRecurringSchedule('${schedule.id}')"
        >
          Resume Schedule
        </button>
      `;

  return `
    <article
      class="
        task-card
        recurring-schedule-card
        ${
          schedule.active
            ? ""
            : "schedule-is-paused"
        }
      "
    >

      <div class="task-top">

        <div>

          <h4>
            ${escapeHtml(schedule.title)}
          </h4>

          ${
            schedule.description
              ? `
                <p class="task-description">
                  ${escapeHtml(schedule.description)}
                </p>
              `
              : ""
          }

        </div>

        <div class="badges">

          <span class="badge recurring-badge">
            ↻ ${escapeHtml(
              getRepeatLabel(
                schedule.repeatType
              )
            )}
          </span>

          <span
            class="badge priority-${escapeHtml(schedule.priority)}"
          >
            ${escapeHtml(schedule.priority.toUpperCase())}
          </span>

          ${
            schedule.photoRequired
              ? `
                <span class="badge evidence-required-badge">
                  📷 PHOTO REQUIRED
                </span>
              `
              : ""
          }

          ${statusBadge}

        </div>

      </div>

      <div class="task-meta">

        <span>
          📅 Next:
          ${formatDate(schedule.nextDueDate)}
        </span>

        <span>
          👤 ${escapeHtml(assignedName)}
        </span>

        <span>
          🏬 ${escapeHtml(schedule.department)}
        </span>

        <span>
          ＋ ${escapeHtml(
            getProfileName(
              schedule.createdBy
            )
          )}
        </span>

      </div>

      <div class="task-actions">
        ${controlButton}
      </div>

    </article>
  `;
}

function renderRecurringSchedules() {
  const summary =
    getElement(
      "recurringTasksSummary"
    );

  const list =
    getElement(
      "recurringTasksList"
    );

  if (!summary || !list) return;

  if (!canManageTasks()) {
    summary.innerHTML = "";
    list.innerHTML = "";

    return;
  }

  const activeSchedules =
    recurringSchedules.filter(
      schedule =>
        schedule.active
    );

  const pausedSchedules =
    recurringSchedules.filter(
      schedule =>
        !schedule.active
    );

  const photoSchedules =
    recurringSchedules.filter(
      schedule =>
        schedule.photoRequired
    );

  const dailySchedules =
    recurringSchedules.filter(
      schedule =>
        schedule.repeatType ===
        "daily"
    );

  summary.innerHTML = `
    <article class="stat-card">

      <div class="stat-icon red">
        01
      </div>

      <div>

        <p>
          Active schedules
        </p>

        <strong>
          ${activeSchedules.length}
        </strong>

        <small>
          Currently generating tasks
        </small>

      </div>

    </article>

    <article class="stat-card">

      <div class="stat-icon amber">
        02
      </div>

      <div>

        <p>
          Paused schedules
        </p>

        <strong>
          ${pausedSchedules.length}
        </strong>

        <small>
          Temporarily stopped
        </small>

      </div>

    </article>

    <article class="stat-card">

      <div class="stat-icon green">
        03
      </div>

      <div>

        <p>
          Photo schedules
        </p>

        <strong>
          ${photoSchedules.length}
        </strong>

        <small>
          Require evidence every cycle
        </small>

      </div>

    </article>

    <article class="stat-card">

      <div class="stat-icon dark">
        04
      </div>

      <div>

        <p>
          Daily schedules
        </p>

        <strong>
          ${dailySchedules.length}
        </strong>

        <small>
          Repeating every day
        </small>

      </div>

    </article>
  `;

  if (!recurringSchedules.length) {
    list.innerHTML = `
      <div class="empty-state">

        <strong>
          No recurring schedules yet
        </strong>

        Create a task and choose Daily, Weekly or Monthly.

      </div>
    `;

    return;
  }

  list.innerHTML =
    recurringSchedules
      .map(
        createRecurringScheduleCard
      )
      .join("");
}

/* =========================================
   ACTIVITY LOG
========================================= */

function getActivityLabel(action) {
  const labels = {
    created:
      "created",

    completed:
      "completed",

    reopened:
      "reopened",

    archived:
      "archived",

    restored:
      "restored",

    deleted:
      "deleted",

    photo_uploaded:
      "uploaded photo evidence for",

    recurring_created:
      "created recurring schedule",

    recurring_paused:
      "paused recurring schedule",

    recurring_resumed:
      "resumed recurring schedule",

    recurring_generated:
      "generated recurring task"
  };

  return (
    labels[action] ||
    action
  );
}

function getActivityIcon(action) {
  const icons = {
    created: "＋",
    completed: "✓",
    reopened: "↻",
    archived: "□",
    restored: "↑",
    deleted: "✕",
    photo_uploaded: "📷",
    recurring_created: "↻",
    recurring_paused: "Ⅱ",
    recurring_resumed: "▶",
    recurring_generated: "＋"
  };

  return (
    icons[action] ||
    "•"
  );
}

function getActivityBadgeClass(
  action
) {
  if (
    action === "completed" ||
    action ===
      "recurring_resumed" ||
    action ===
      "photo_uploaded"
  ) {
    return "priority-low";
  }

  if (
    action === "deleted" ||
    action === "archived" ||
    action ===
      "recurring_paused"
  ) {
    return "priority-high";
  }

  return "priority-medium";
}

function renderActivityLog() {
  const summary =
    getElement(
      "activityLogSummary"
    );

  const list =
    getElement(
      "activityLogList"
    );

  const searchInput =
    getElement(
      "activitySearchInput"
    );

  const actionFilter =
    getElement(
      "activityActionFilter"
    );

  if (
    !summary ||
    !list ||
    !searchInput ||
    !actionFilter
  ) {
    return;
  }

  if (!canManageTasks()) {
    summary.innerHTML = "";
    list.innerHTML = "";

    return;
  }

  const todayLogs =
    activityLogs.filter(log => {
      return isToday(
        log.createdAt
      );
    });

  const completedCount =
    activityLogs.filter(log => {
      return (
        log.action ===
        "completed"
      );
    }).length;

  const photoCount =
    activityLogs.filter(log => {
      return (
        log.action ===
        "photo_uploaded"
      );
    }).length;

  const recurringCount =
    activityLogs.filter(log => {
      return log.action.startsWith(
        "recurring_"
      );
    }).length;

  summary.innerHTML = `
    <article class="stat-card">

      <div class="stat-icon red">
        01
      </div>

      <div>

        <p>
          Activity today
        </p>

        <strong>
          ${todayLogs.length}
        </strong>

        <small>
          Actions recorded today
        </small>

      </div>

    </article>

    <article class="stat-card">

      <div class="stat-icon green">
        02
      </div>

      <div>

        <p>
          Tasks completed
        </p>

        <strong>
          ${completedCount}
        </strong>

        <small>
          Recorded completions
        </small>

      </div>

    </article>

    <article class="stat-card">

      <div class="stat-icon amber">
        03
      </div>

      <div>

        <p>
          Photos uploaded
        </p>

        <strong>
          ${photoCount}
        </strong>

        <small>
          Evidence records created
        </small>

      </div>

    </article>

    <article class="stat-card">

      <div class="stat-icon dark">
        04
      </div>

      <div>

        <p>
          Recurring actions
        </p>

        <strong>
          ${recurringCount}
        </strong>

        <small>
          Recurring schedule activity
        </small>

      </div>

    </article>
  `;

  const search =
    searchInput.value
      .trim()
      .toLowerCase();

  const selectedAction =
    actionFilter.value;

  const filteredLogs =
    activityLogs.filter(log => {
      const userName =
        getProfileName(
          log.userId
        );

      const searchableText = `
        ${userName}
        ${log.action}
        ${log.details}
      `.toLowerCase();

      const matchesSearch =
        !search ||
        searchableText.includes(
          search
        );

      let matchesAction =
        selectedAction === "all" ||
        log.action ===
          selectedAction;

      if (
        selectedAction ===
        "recurring"
      ) {
        matchesAction =
          log.action.startsWith(
            "recurring_"
          );
      }

      return (
        matchesSearch &&
        matchesAction
      );
    });

  if (!filteredLogs.length) {
    list.innerHTML = `
      <div class="empty-state">

        <strong>
          No activity found
        </strong>

        New task actions will appear here automatically.

      </div>
    `;

    return;
  }

  list.innerHTML =
    filteredLogs
      .map(log => {
        const userName =
          getProfileName(
            log.userId
          );

        const label =
          getActivityLabel(
            log.action
          );

        const icon =
          getActivityIcon(
            log.action
          );

        return `
          <article class="task-card">

            <div class="task-top">

              <div>

                <h4>
                  ${escapeHtml(userName)}
                  ${escapeHtml(label)}
                  “${escapeHtml(log.details)}”
                </h4>

                <p class="task-description">
                  ${formatDateTime(log.createdAt)}
                </p>

              </div>

              <div class="badges">

                <span
                  class="
                    badge
                    ${getActivityBadgeClass(log.action)}
                  "
                >
                  ${escapeHtml(icon)}
                  ${escapeHtml(
                    log.action
                      .replaceAll(
                        "_",
                        " "
                      )
                      .toUpperCase()
                  )}
                </span>

              </div>

            </div>

            <div class="task-meta">

              <span>
                👤 ${escapeHtml(userName)}
              </span>

              <span>
                🕒 ${formatDateTime(log.createdAt)}
              </span>

            </div>

          </article>
        `;
      })
      .join("");
}

/* =========================================
   MAIN RENDER
========================================= */

function renderWebsite() {
  const activeTasks =
    tasks.filter(
      task => !task.archived
    );

  const todoTasks =
    activeTasks.filter(
      task =>
        task.status === "todo"
    );

  const completedTasks =
    activeTasks.filter(
      task =>
        task.status ===
        "completed"
    );

  const archivedTasks =
    tasks.filter(
      task => task.archived
    );

  getElement(
    "totalCount"
  ).textContent =
    activeTasks.length;

  getElement(
    "todoCount"
  ).textContent =
    todoTasks.length;

  getElement(
    "completedCount"
  ).textContent =
    completedTasks.length;

  getElement(
    "highCount"
  ).textContent =
    todoTasks.filter(
      task =>
        task.priority === "high"
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

  getElement(
    "progressPercent"
  ).textContent =
    `${percentage}%`;

  getElement(
    "progressRing"
  )
    .style
    .setProperty(
      "--p",
      percentage
    );

  if (!activeTasks.length) {
    getElement(
      "progressText"
    ).textContent =
      "No active tasks yet.";
  } else if (
    percentage === 100
  ) {
    getElement(
      "progressText"
    ).textContent =
      "Excellent — every active task is complete.";
  } else {
    getElement(
      "progressText"
    ).textContent =
      `${completedTasks.length} of ${activeTasks.length} active tasks completed.`;
  }

  getElement(
    "summaryTodo"
  ).textContent =
    todoTasks.length;

  getElement(
    "summaryDone"
  ).textContent =
    completedTasks.length;

  renderTaskList(
    "dashboardTaskList",
    sortTasks(todoTasks)
      .slice(0, 6)
  );

  renderTaskList(
    "completedTaskList",
    sortTasks(completedTasks)
  );

  renderTaskList(
    "archiveTaskList",
    sortTasks(archivedTasks)
  );

  renderFilteredTasks();

  renderWeeklyPlanner();

  renderMyTasks();

  renderStaffOverview();

  renderRecurringSchedules();

  renderActivityLog();

  updateUserDisplay();
}

/* =========================================
   CREATE TASKS
========================================= */

async function createRecurringTask(
  taskData,
  repeatType,
  photoRequired
) {
  const nextDueDate =
    calculateNextDueDate(
      taskData.due_date,
      repeatType
    );

  const {
    data: schedule,
    error: scheduleError
  } =
    await supabaseClient
      .from(
        "recurring_schedules"
      )
      .insert({
        title:
          taskData.title,

        description:
          taskData.description,

        department:
          taskData.department,

        priority:
          taskData.priority,

        assigned_to:
          taskData.assigned_to,

        assigned_to_user_id:
          taskData.assigned_to_user_id,

        created_by:
          currentUser.id,

        repeat_type:
          repeatType,

        next_due_date:
          nextDueDate,

        active:
          true,

        photo_required:
          photoRequired
      })
      .select()
      .single();

  if (scheduleError) {
    throw scheduleError;
  }

  const { error: taskError } =
    await supabaseClient
      .from("tasks")
      .insert({
        ...taskData,

        recurring_schedule_id:
          schedule.id,

        photo_required:
          photoRequired
      });

  if (taskError) {
    await supabaseClient
      .from(
        "recurring_schedules"
      )
      .delete()
      .eq(
        "id",
        schedule.id
      );

    throw taskError;
  }
}

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
    getElement(
      "taskTitle"
    ).value.trim();

  const description =
    getElement(
      "taskDescription"
    ).value.trim();

  const department =
    getElement(
      "taskDepartment"
    ).value;

  const priority =
    getElement(
      "taskPriority"
    ).value;

  const dueDate =
    getElement(
      "taskDueDate"
    ).value || null;

  const assignedToUserId =
    getElement(
      "taskAssignedTo"
    ).value || null;

  const repeatType =
    getElement(
      "taskRepeat"
    )?.value || "none";

  const photoRequired =
    getElement(
      "taskPhotoRequired"
    )?.value === "true";

  const assignedProfile =
    profiles.find(
      profile =>
        profile.id ===
        assignedToUserId
    );

  const assignedToName =
    assignedProfile?.full_name ||
    null;

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

  if (
    repeatType !== "none" &&
    !canManageTasks()
  ) {
    showToast(
      "Only managers and owners can create recurring tasks."
    );

    return;
  }

  if (
    photoRequired &&
    !canManageTasks()
  ) {
    showToast(
      "Only managers and owners can require photo evidence."
    );

    return;
  }

  if (
    repeatType !== "none" &&
    !dueDate
  ) {
    showToast(
      "Recurring tasks need a first due date."
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

  const taskData = {
    title,

    description:
      description || null,

    department,

    priority,

    due_date:
      dueDate,

    assigned_to:
      assignedToName,

    assigned_to_user_id:
      assignedToUserId,

    created_by:
      currentUser.id,

    status:
      "todo",

    archived:
      false
  };

  try {
    if (
      repeatType === "none"
    ) {
      const { error } =
        await supabaseClient
          .from("tasks")
          .insert({
            ...taskData,

            photo_required:
              photoRequired
          });

      if (error) throw error;
    } else {
      await createRecurringTask(
        taskData,
        repeatType,
        photoRequired
      );
    }

    closeTaskModal();

    showToast(
      repeatType === "none"
        ? "Task added successfully."
        : "Recurring task schedule created."
    );

    await refreshStoreflowData();
  } catch (error) {
    console.error(
      "Task creation error:",
      error
    );

    showToast(
      `Could not add task: ${error.message}`
    );
  } finally {
    submitButton.disabled = false;

    submitButton.textContent =
      "Add Task";
  }
}

/* =========================================
   PHOTO EVIDENCE
========================================= */

window.openEvidenceUpload =
  function(taskId) {
    const task =
      tasks.find(
        item =>
          item.id === taskId
      );

    if (
      !task ||
      !canActOnTask(task) ||
      task.archived
    ) {
      showToast(
        "You cannot upload evidence for this task."
      );

      return;
    }

    currentEvidenceTaskId =
      taskId;

    selectedEvidenceFile =
      null;

    clearEvidencePreview();

    getElement(
      "evidenceTaskTitle"
    ).textContent =
      task.title;

    const existingEvidence =
      getEvidenceForTask(
        taskId
      );

    getElement(
      "evidenceStatusText"
    ).textContent =
      existingEvidence
        ? "Choose a new photo to replace the current evidence."
        : "Select a clear photo showing the completed work.";

    getElement(
      "evidenceError"
    ).textContent = "";

    hideElement(
      "evidenceError"
    );

    getElement(
      "evidenceFile"
    ).value = "";

    getElement(
      "uploadEvidenceButton"
    ).disabled =
      false;

    getElement(
      "uploadEvidenceButton"
    ).textContent =
      existingEvidence
        ? "Replace Evidence"
        : "Upload Evidence";

    showElement(
      "evidenceModal"
    );
  };

function clearEvidencePreview() {
  if (evidencePreviewUrl) {
    URL.revokeObjectURL(
      evidencePreviewUrl
    );

    evidencePreviewUrl =
      null;
  }

  selectedEvidenceFile =
    null;

  getElement(
    "evidencePreview"
  )?.removeAttribute(
    "src"
  );

  hideElement(
    "evidencePreviewContainer"
  );
}

function closeEvidenceModal() {
  hideElement(
    "evidenceModal"
  );

  clearEvidencePreview();

  currentEvidenceTaskId =
    null;

  if (
    getElement("evidenceFile")
  ) {
    getElement(
      "evidenceFile"
    ).value = "";
  }
}

function handleEvidenceFileSelection(
  event
) {
  const file =
    event.target.files?.[0] ||
    null;

  const errorElement =
    getElement(
      "evidenceError"
    );

  errorElement.textContent = "";

  errorElement.classList.add(
    "hidden"
  );

  clearEvidencePreview();

  if (!file) return;

  const acceptedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (
    !acceptedTypes.includes(
      file.type
    )
  ) {
    errorElement.textContent =
      "Choose a JPG, PNG or WebP image.";

    errorElement.classList.remove(
      "hidden"
    );

    event.target.value = "";

    return;
  }

  if (
    file.size <= 0 ||
    file.size >
      5 * 1024 * 1024
  ) {
    errorElement.textContent =
      "The photo must be no larger than 5 MB.";

    errorElement.classList.remove(
      "hidden"
    );

    event.target.value = "";

    return;
  }

  selectedEvidenceFile =
    file;

  evidencePreviewUrl =
    URL.createObjectURL(file);

  getElement(
    "evidencePreview"
  ).src =
    evidencePreviewUrl;

  getElement(
    "evidencePreviewName"
  ).textContent =
    file.name;

  getElement(
    "evidencePreviewSize"
  ).textContent =
    bytesToDisplay(
      file.size
    );

  showElement(
    "evidencePreviewContainer"
  );
}

async function uploadTaskEvidence() {
  const errorElement =
    getElement(
      "evidenceError"
    );

  const uploadButton =
    getElement(
      "uploadEvidenceButton"
    );

  const task =
    tasks.find(
      item =>
        item.id ===
        currentEvidenceTaskId
    );

  errorElement.textContent = "";

  errorElement.classList.add(
    "hidden"
  );

  if (
    !task ||
    !canActOnTask(task)
  ) {
    errorElement.textContent =
      "You cannot upload evidence for this task.";

    errorElement.classList.remove(
      "hidden"
    );

    return;
  }

  if (!selectedEvidenceFile) {
    errorElement.textContent =
      "Please choose a photo first.";

    errorElement.classList.remove(
      "hidden"
    );

    return;
  }

  const existingEvidence =
    getEvidenceForTask(
      task.id
    );

  const fileName =
    sanitiseFileName(
      selectedEvidenceFile.name
    );

  const newStoragePath =
    `${task.id}/${currentUser.id}/${Date.now()}-${fileName}`;

  uploadButton.disabled = true;

  uploadButton.textContent =
    "Uploading...";

  let uploadedNewFile = false;

  try {
    const { error: uploadError } =
      await supabaseClient.storage
        .from("task-evidence")
        .upload(
          newStoragePath,
          selectedEvidenceFile,
          {
            cacheControl:
              "3600",

            upsert:
              false,

            contentType:
              selectedEvidenceFile.type
          }
        );

    if (uploadError) {
      throw uploadError;
    }

    uploadedNewFile = true;

    const evidencePayload = {
      task_id:
        task.id,

      storage_path:
        newStoragePath,

      original_file_name:
        selectedEvidenceFile.name,

      mime_type:
        selectedEvidenceFile.type,

      file_size_bytes:
        selectedEvidenceFile.size,

      uploaded_by:
        currentUser.id,

      uploaded_at:
        new Date()
          .toISOString()
    };

    let metadataError = null;

    if (existingEvidence) {
      const result =
        await supabaseClient
          .from("task_evidence")
          .update(
            evidencePayload
          )
          .eq(
            "id",
            existingEvidence.id
          );

      metadataError =
        result.error;
    } else {
      const result =
        await supabaseClient
          .from("task_evidence")
          .insert(
            evidencePayload
          );

      metadataError =
        result.error;
    }

    if (metadataError) {
      throw metadataError;
    }

    if (
      existingEvidence?.storagePath &&
      existingEvidence.storagePath !==
        newStoragePath
    ) {
      const {
        error: removeOldError
      } =
        await supabaseClient.storage
          .from("task-evidence")
          .remove([
            existingEvidence.storagePath
          ]);

      if (removeOldError) {
        console.warn(
          "Old evidence cleanup warning:",
          removeOldError
        );
      }
    }

    closeEvidenceModal();

    showToast(
      existingEvidence
        ? "Photo evidence replaced."
        : "Photo evidence uploaded."
    );

    await Promise.all([
      loadTaskEvidence(),

      canManageTasks()
        ? loadActivityLogs()
        : Promise.resolve()
    ]);
  } catch (error) {
    console.error(
      "Evidence upload error:",
      error
    );

    if (uploadedNewFile) {
      await supabaseClient.storage
        .from("task-evidence")
        .remove([
          newStoragePath
        ]);
    }

    errorElement.textContent =
      `Could not upload evidence: ${error.message}`;

    errorElement.classList.remove(
      "hidden"
    );
  } finally {
    uploadButton.disabled = false;

    uploadButton.textContent =
      existingEvidence
        ? "Replace Evidence"
        : "Upload Evidence";
  }
}

window.viewTaskEvidence =
  async function(taskId) {
    const evidence =
      getEvidenceForTask(
        taskId
      );

    const task =
      tasks.find(
        item =>
          item.id === taskId
      );

    if (!evidence || !task) {
      showToast(
        "No photo evidence is available for this task."
      );

      return;
    }

    getElement(
      "evidenceViewerTitle"
    ).textContent =
      task.title;

    getElement(
      "evidenceViewerImage"
    ).classList.add(
      "hidden"
    );

    getElement(
      "evidenceViewerImage"
    ).removeAttribute(
      "src"
    );

    getElement(
      "evidenceViewerLoading"
    ).textContent =
      "Loading secure photo...";

    getElement(
      "evidenceViewerLoading"
    ).classList.remove(
      "hidden"
    );

    getElement(
      "evidenceViewerDetails"
    ).innerHTML = "";

    showElement(
      "evidenceViewerModal"
    );

    const { data, error } =
      await supabaseClient.storage
        .from("task-evidence")
        .createSignedUrl(
          evidence.storagePath,
          300
        );

    if (
      error ||
      !data?.signedUrl
    ) {
      console.error(
        "Signed URL error:",
        error
      );

      getElement(
        "evidenceViewerLoading"
      ).textContent =
        "The secure photo could not be opened.";

      return;
    }

    const image =
      getElement(
        "evidenceViewerImage"
      );

    image.onload = () => {
      getElement(
        "evidenceViewerLoading"
      ).classList.add(
        "hidden"
      );

      image.classList.remove(
        "hidden"
      );
    };

    image.onerror = () => {
      getElement(
        "evidenceViewerLoading"
      ).textContent =
        "The photo could not be displayed.";
    };

    image.src =
      data.signedUrl;

    getElement(
      "evidenceViewerDetails"
    ).innerHTML = `
      <strong>
        ${escapeHtml(
          evidence.originalFileName
        )}
      </strong>

      <span>
        Uploaded by
        ${escapeHtml(
          getProfileName(
            evidence.uploadedBy
          )
        )}
        on
        ${formatDateTime(
          evidence.uploadedAt
        )}
      </span>

      <span>
        ${escapeHtml(
          bytesToDisplay(
            evidence.fileSizeBytes
          )
        )}
      </span>

      <small>
        Secure link expires in five minutes.
      </small>
    `;
  };

function closeEvidenceViewer() {
  hideElement(
    "evidenceViewerModal"
  );

  const image =
    getElement(
      "evidenceViewerImage"
    );

  image.removeAttribute(
    "src"
  );

  image.classList.add(
    "hidden"
  );

  getElement(
    "evidenceViewerDetails"
  ).innerHTML = "";
}

/* =========================================
   TASK ACTIONS
========================================= */

window.completeTask =
  async function(taskId) {
    if (!currentUser) return;

    const task =
      tasks.find(
        item =>
          item.id === taskId
      );

    if (!task) {
      showToast(
        "Task could not be found."
      );

      return;
    }

    if (!canActOnTask(task)) {
      showToast(
        "This task is assigned to another staff member."
      );

      return;
    }

    if (
      task.photoRequired &&
      !getEvidenceForTask(
        task.id
      )
    ) {
      showToast(
        "Upload the required photo evidence before completing this task."
      );

      openEvidenceUpload(
        task.id
      );

      return;
    }

    if (
      !confirm(
        task.recurringScheduleId
          ? "Mark this task as completed? The next recurring task will be created automatically."
          : "Mark this task as completed?"
      )
    ) {
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
            new Date()
              .toISOString()
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
      task.recurringScheduleId
        ? "Task completed. The next recurring task was created."
        : "Task marked as completed."
    );

    await refreshStoreflowData();
  };

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
      showToast(
        `Could not reopen task: ${error.message}`
      );

      return;
    }

    showToast(
      "Task reopened."
    );

    await refreshStoreflowData();
  };

window.archiveTask =
  async function(taskId) {
    if (!canManageTasks()) {
      showToast(
        "Only managers and owners can archive tasks."
      );

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
          archived: true
        })
        .eq(
          "id",
          taskId
        );

    if (error) {
      showToast(
        `Could not archive task: ${error.message}`
      );

      return;
    }

    showToast(
      "Task moved to archive."
    );

    await refreshStoreflowData();
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
          archived: false
        })
        .eq(
          "id",
          taskId
        );

    if (error) {
      showToast(
        `Could not restore task: ${error.message}`
      );

      return;
    }

    showToast(
      "Task restored."
    );

    await refreshStoreflowData();
  };

window.deleteTask =
  async function(taskId) {
    if (!canManageTasks()) {
      showToast(
        "Only managers and owners can delete tasks."
      );

      return;
    }

    if (
      !confirm(
        "Permanently delete this task? This cannot be undone."
      )
    ) {
      return;
    }

    const evidence =
      getEvidenceForTask(
        taskId
      );

    if (
      evidence?.storagePath
    ) {
      const {
        error: storageError
      } =
        await supabaseClient.storage
          .from("task-evidence")
          .remove([
            evidence.storagePath
          ]);

      if (storageError) {
        showToast(
          `Could not remove the task photo: ${storageError.message}`
        );

        return;
      }
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
      showToast(
        `Could not delete task: ${error.message}`
      );

      return;
    }

    showToast(
      "Task permanently deleted."
    );

    await refreshStoreflowData();
  };

window.pauseRecurringSchedule =
  async function(scheduleId) {
    if (!canManageTasks()) {
      showToast(
        "Only managers and owners can pause recurring schedules."
      );

      return;
    }

    if (
      !confirm(
        "Pause this recurring schedule? Existing tasks will remain available."
      )
    ) {
      return;
    }

    const { error } =
      await supabaseClient
        .from(
          "recurring_schedules"
        )
        .update({
          active:
            false,

          updated_at:
            new Date()
              .toISOString()
        })
        .eq(
          "id",
          scheduleId
        );

    if (error) {
      showToast(
        `Could not pause schedule: ${error.message}`
      );

      return;
    }

    showToast(
      "Recurring schedule paused."
    );

    await refreshStoreflowData();
  };

window.resumeRecurringSchedule =
  async function(scheduleId) {
    if (!canManageTasks()) {
      showToast(
        "Only managers and owners can resume recurring schedules."
      );

      return;
    }

    const { error } =
      await supabaseClient
        .from(
          "recurring_schedules"
        )
        .update({
          active:
            true,

          updated_at:
            new Date()
              .toISOString()
        })
        .eq(
          "id",
          scheduleId
        );

    if (error) {
      showToast(
        `Could not resume schedule: ${error.message}`
      );

      return;
    }

    showToast(
      "Recurring schedule resumed."
    );

    await refreshStoreflowData();
  };

/* =========================================
   MODALS AND NAVIGATION
========================================= */

function openTaskModal() {
  showElement(
    "taskModal"
  );

  updateRepeatFields();

  getElement(
    "taskTitle"
  ).focus();
}

function closeTaskModal() {
  hideElement(
    "taskModal"
  );

  getElement(
    "taskForm"
  ).reset();

  getElement(
    "taskPriority"
  ).value =
    "medium";

  getElement(
    "taskAssignedTo"
  ).value = "";

  if (
    getElement("taskRepeat")
  ) {
    getElement(
      "taskRepeat"
    ).value =
      "none";
  }

  if (
    getElement(
      "taskPhotoRequired"
    )
  ) {
    getElement(
      "taskPhotoRequired"
    ).value =
      "false";
  }

  updateRepeatFields();
}

function updateRepeatFields() {
  const repeatSelect =
    getElement(
      "taskRepeat"
    );

  const repeatLabel =
    getElement(
      "taskRepeatLabel"
    );

  const photoLabel =
    getElement(
      "taskPhotoRequiredLabel"
    );

  const photoSelect =
    getElement(
      "taskPhotoRequired"
    );

  const helpLabel =
    getElement(
      "repeatHelpLabel"
    );

  const helpInput =
    getElement(
      "repeatHelp"
    );

  const dueDateInput =
    getElement(
      "taskDueDate"
    );

  if (
    !repeatSelect ||
    !helpLabel ||
    !helpInput
  ) {
    return;
  }

  if (!canManageTasks()) {
    repeatSelect.value =
      "none";

    repeatLabel?.classList.add(
      "hidden"
    );

    photoLabel?.classList.add(
      "hidden"
    );

    if (photoSelect) {
      photoSelect.value =
        "false";
    }

    helpLabel.classList.add(
      "hidden"
    );

    return;
  }

  repeatLabel?.classList.remove(
    "hidden"
  );

  photoLabel?.classList.remove(
    "hidden"
  );

  if (
    repeatSelect.value ===
    "none"
  ) {
    helpLabel.classList.add(
      "hidden"
    );

    return;
  }

  helpLabel.classList.remove(
    "hidden"
  );

  const dueDate =
    dueDateInput?.value;

  if (!dueDate) {
    helpInput.value =
      "Choose the first due date";

    return;
  }

  const date =
    new Date(
      `${dueDate}T00:00:00`
    );

  if (
    repeatSelect.value ===
    "daily"
  ) {
    helpInput.value =
      "A new task will be created every day after completion.";
  } else if (
    repeatSelect.value ===
    "weekly"
  ) {
    helpInput.value =
      `Repeats every ${date.toLocaleDateString(
        "en-AU",
        {
          weekday: "long"
        }
      )}.`;
  } else {
    helpInput.value =
      `Repeats monthly on day ${date.getDate()}.`;
  }
}

function switchView(viewName) {
  const protectedViews = [
    "archive",
    "staffOverview",
    "activityLog",
    "recurringTasks"
  ];

  if (
    protectedViews.includes(
      viewName
    ) &&
    !canManageTasks()
  ) {
    showToast(
      "Only managers and owners can access this page."
    );

    return;
  }

  currentView =
    viewName;

  const pageTitles = {
    dashboard:
      "Dashboard",

    myTasks:
      "My Tasks",

    planner:
      "Weekly Planner",

    tasks:
      "All Tasks",

    completed:
      "Completed Tasks",

    staffOverview:
      "Staff Overview",

    recurringTasks:
      "Recurring Tasks",

    activityLog:
      "Activity Log",

    archive:
      "Archive"
  };

  document
    .querySelectorAll(
      ".view"
    )
    .forEach(view => {
      view.classList.remove(
        "active"
      );
    });

  document
    .querySelectorAll(
      ".nav-link"
    )
    .forEach(button => {
      button.classList.remove(
        "active"
      );
    });

  getElement(
    `${viewName}View`
  )
    ?.classList
    .add(
      "active"
    );

  document
    .querySelector(
      `[data-view="${viewName}"]`
    )
    ?.classList
    .add(
      "active"
    );

  getElement(
    "pageTitle"
  ).textContent =
    pageTitles[viewName] ||
    "StoreFlow";

  getElement(
    "sidebar"
  ).classList.remove(
    "open"
  );

  getElement(
    "mobileOverlay"
  ).classList.remove(
    "show"
  );

  if (
    viewName ===
      "activityLog" &&
    canManageTasks()
  ) {
    loadActivityLogs();
  }

  if (
    viewName ===
      "recurringTasks" &&
    canManageTasks()
  ) {
    loadRecurringSchedules();
  }
}

/* =========================================
   DATA REFRESH AND REALTIME
========================================= */

async function refreshStoreflowData() {
  await Promise.all([
    loadRecurringSchedules(),

    loadTasks(),

    loadTaskEvidence(),

    canManageTasks()
      ? loadActivityLogs()
      : Promise.resolve()
  ]);
}

function subscribeToRealtimeChanges() {
  if (realtimeChannel) {
    supabaseClient.removeChannel(
      realtimeChannel
    );
  }

  realtimeChannel =
    supabaseClient
      .channel(
        "storeflow-live-changes"
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table:
            "activity_logs"
        },
        async () => {
          if (
            canManageTasks()
          ) {
            await loadActivityLogs();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table:
            "recurring_schedules"
        },
        async () => {
          await loadRecurringSchedules();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table:
            "task_evidence"
        },
        async () => {
          await loadTaskEvidence();
        }
      )
      .subscribe();
}

/* =========================================
   APPLICATION SESSION
========================================= */

async function showStoreflowApp(
  user
) {
  if (
    isInitialising &&
    currentUser?.id ===
      user.id
  ) {
    return;
  }

  isInitialising = true;

  currentUser =
    user;

  try {
    const profileLoaded =
      await loadCurrentProfile();

    if (!profileLoaded) {
      return;
    }

    await loadProfiles();

    populateAssigneeDropdown();

    await Promise.all([
      loadRecurringSchedules(),

      loadTasks(),

      loadTaskEvidence(),

      canManageTasks()
        ? loadActivityLogs()
        : Promise.resolve()
    ]);

    setGreeting();

    updateUserDisplay();

    subscribeToRealtimeChanges();

    hideElement(
      "loginScreen"
    );

    showElement(
      "storeflowApp"
    );
  } finally {
    isInitialising = false;
  }
}

function showLoginScreen() {
  currentUser = null;

  currentProfile = null;

  tasks = [];

  profiles = [];

  activityLogs = [];

  recurringSchedules = [];

  taskEvidence = [];

  currentView =
    "dashboard";

  currentEvidenceTaskId =
    null;

  selectedEvidenceFile =
    null;

  if (realtimeChannel) {
    supabaseClient.removeChannel(
      realtimeChannel
    );

    realtimeChannel = null;
  }

  closeEvidenceModal();

  closeEvidenceViewer();

  hideElement(
    "storeflowApp"
  );

  showElement(
    "loginScreen"
  );

  getElement(
    "loginForm"
  )?.reset();

  const loginError =
    getElement(
      "loginError"
    );

  if (loginError) {
    loginError.textContent = "";

    loginError.classList.add(
      "hidden"
    );
  }
}

/* =========================================
   TOAST
========================================= */

function showToast(message) {
  const toast =
    getElement("toast");

  if (!toast) return;

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
  .querySelectorAll(
    ".nav-link"
  )
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

getElement("taskForm")
  ?.addEventListener(
    "submit",
    addTask
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

getElement("taskRepeat")
  ?.addEventListener(
    "change",
    updateRepeatFields
  );

getElement("taskDueDate")
  ?.addEventListener(
    "change",
    updateRepeatFields
  );

getElement("activitySearchInput")
  ?.addEventListener(
    "input",
    renderActivityLog
  );

getElement("activityActionFilter")
  ?.addEventListener(
    "change",
    renderActivityLog
  );

getElement("evidenceFile")
  ?.addEventListener(
    "change",
    handleEvidenceFileSelection
  );

getElement("uploadEvidenceButton")
  ?.addEventListener(
    "click",
    uploadTaskEvidence
  );

getElement("closeEvidenceModal")
  ?.addEventListener(
    "click",
    closeEvidenceModal
  );

getElement("cancelEvidenceModal")
  ?.addEventListener(
    "click",
    closeEvidenceModal
  );

getElement("evidenceModal")
  ?.addEventListener(
    "click",
    event => {
      if (
        event.target.id ===
        "evidenceModal"
      ) {
        closeEvidenceModal();
      }
    }
  );

getElement("closeEvidenceViewer")
  ?.addEventListener(
    "click",
    closeEvidenceViewer
  );

getElement("evidenceViewerModal")
  ?.addEventListener(
    "click",
    event => {
      if (
        event.target.id ===
        "evidenceViewerModal"
      ) {
        closeEvidenceViewer();
      }
    }
  );

getElement("menuButton")
  ?.addEventListener(
    "click",
    () => {
      getElement(
        "sidebar"
      ).classList.toggle(
        "open"
      );

      getElement(
        "mobileOverlay"
      ).classList.toggle(
        "show"
      );
    }
  );

getElement("mobileOverlay")
  ?.addEventListener(
    "click",
    () => {
      getElement(
        "sidebar"
      ).classList.remove(
        "open"
      );

      getElement(
        "mobileOverlay"
      ).classList.remove(
        "show"
      );
    }
  );

document.addEventListener(
  "keydown",
  event => {
    if (
      event.key !== "Escape"
    ) {
      return;
    }

    if (
      !getElement(
        "evidenceViewerModal"
      )?.classList.contains(
        "hidden"
      )
    ) {
      closeEvidenceViewer();

      return;
    }

    if (
      !getElement(
        "evidenceModal"
      )?.classList.contains(
        "hidden"
      )
    ) {
      closeEvidenceModal();

      return;
    }

    if (
      !getElement(
        "taskModal"
      )?.classList.contains(
        "hidden"
      )
    ) {
      closeTaskModal();
    }
  }
);

/* =========================================
   AUTH STATE AND INITIALISE
========================================= */

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