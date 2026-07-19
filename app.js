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

let tasks = [];

let profiles = [];

let activityLogs = [];

let recurringSchedules = [];

let currentUser = null;

let currentProfile = null;

let currentView = "dashboard";

let realtimeChannel = null;

let toastTimer = null;

let isInitialising = false;

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
  if (role === "owner") {
      return "Store Owner";
  }

  if (role === "manager") {
      return "Manager";
  }

  return "Staff";
}

function getProfileName(userId) {
  if (!userId) {
      return "System";
  }

  const profile = profiles.find(
      item => item.id === userId
  );

  return profile?.full_name || "Former staff member";
}

function getAssignedProfileName(task) {
  if (!task.assignedToUserId) {
      return "Anyone";
  }

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
  if (!value) {
      return false;
  }

  return (
      getLocalDateKey(new Date(value)) ===
      getLocalDateKey(new Date())
  );
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

async function signIn(event) {
  event.preventDefault();

  const username = getElement("loginUsername")
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

  loginError.classList.add("hidden");

  if (!/^[a-z0-9._-]+$/.test(username)) {
      loginError.textContent =
          "Username can only contain letters, numbers, dots, dashes and underscores.";

      loginError.classList.remove("hidden");

      return;
  }

  const hiddenEmail =
      `${username}@storeflow.internal`;

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

      await supabaseClient.auth.signOut();

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
          .eq("active", true)
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

  getElement("signedInName").textContent =
      fullName;

  getElement("signedInRole").textContent =
      formatRole(currentProfile?.role);

  getElement("userAvatar").textContent =
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
      protectedViews.includes(currentView) &&
      !canManageTasks()
  ) {
      switchView("dashboard");
  }

  updateRepeatFields();
}

function populateAssigneeDropdown() {
  const select =
      getElement("taskAssignedTo");

  if (!select) {
      return;
  }

  const oldValue = select.value;

  const options = profiles
      .map(profile => {
          return `
              <option value="${escapeHtml(profile.id)}">
                  ${escapeHtml(profile.full_name)}
                  — ${escapeHtml(formatRole(profile.role))}
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
          task.recurring_schedule_id || ""
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

  activityLogs = (data || []).map(log => ({
      id:
          log.id,

      userId:
          log.user_id,

      taskId:
          log.task_id,

      action:
          log.action,

      details:
          log.details || "Untitled task",

      createdAt:
          log.created_at
  }));

  renderActivityLog();
}

async function loadRecurringSchedules() {
  if (!currentUser) {
      recurringSchedules = [];

      renderRecurringSchedules();

      return;
  }

  const { data, error } =
      await supabaseClient
          .from("recurring_schedules")
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

          createdAt:
              schedule.created_at,

          updatedAt:
              schedule.updated_at
      }));

  renderRecurringSchedules();
}

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
              return firstTask.status === "todo"
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
      daily:
          "Daily",

      weekly:
          "Weekly",

      monthly:
          "Monthly"
  };

  return labels[repeatType] || "Recurring";
}

function getScheduleForTask(task) {
  if (!task.recurringScheduleId) {
      return null;
  }

  return recurringSchedules.find(
      schedule =>
          schedule.id ===
          task.recurringScheduleId
  ) || null;
}

function createTaskCard(task) {
  const createdByName =
      getProfileName(task.createdBy);

  const completedByName =
      getProfileName(task.completedBy);

  const assignedToName =
      getAssignedProfileName(task);

  const recurringSchedule =
      getScheduleForTask(task);

  const assignedElsewhere =
      task.assignedToUserId &&
      task.assignedToUserId !==
          currentUser?.id;

  const canComplete =
      task.status === "todo" &&
      !task.archived &&
      (
          canManageTasks() ||
          !assignedElsewhere
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

  const recurringBadge =
      task.recurringScheduleId
          ? `
              <span class="badge recurring-badge">
                  ↻ ${
                      escapeHtml(
                          getRepeatLabel(
                              recurringSchedule?.repeatType
                          )
                      )
                  }
              </span>
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

                  ${recurringBadge}

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
                  👤 ${escapeHtml(assignedToName)}
              </span>

              <span>
                  ＋ ${escapeHtml(createdByName)}
              </span>

              ${
                  recurringSchedule
                      ? `
                          <span>
                              ↻ ${escapeHtml(
                                  getRepeatLabel(
                                      recurringSchedule.repeatType
                                  )
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
              ${completeButton}
              ${reopenButton}
              ${archiveButton}
              ${archiveControls}
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

  if (!board) {
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
          )
          .join("");
}

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
              ${getAssignedProfileName(task)}
              ${getProfileName(task.createdBy)}
              ${getProfileName(task.completedBy)}
              ${
                  task.recurringScheduleId
                      ? "recurring repeat"
                      : ""
              }
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
      sortTasks(filteredTasks)
  );
}

function calculateStaffMetrics(profile) {
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
              task.status === "completed"
      );

  const highPriorityTasks =
      openTasks.filter(
          task =>
              task.priority === "high"
      );

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

      completionRate
  };
}

function renderStaffOverview() {
  const summary =
      getElement("staffOverviewSummary");

  const grid =
      getElement("staffOverviewGrid");

  if (!summary || !grid) {
      return;
  }

  if (!canManageTasks()) {
      summary.innerHTML = "";
      grid.innerHTML = "";

      return;
  }

  const activeTasks =
      tasks.filter(
          task => !task.archived
      );

  const unassignedTasks =
      activeTasks.filter(
          task =>
              !task.assignedToUserId
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

  const highPriorityAssignedTasks =
      openAssignedTasks.filter(
          task =>
              task.priority === "high"
      );

  summary.innerHTML = `
      <article class="stat-card">

          <div class="stat-icon red">
              01
          </div>

          <div>
              <p>Open assigned</p>

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
              <p>Completed assigned</p>

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
              <p>Unassigned tasks</p>

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
              <p>High priority</p>

              <strong>
                  ${highPriorityAssignedTasks.length}
              </strong>

              <small>
                  Assigned and still open
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
                  calculateStaffMetrics(profile);

              return `
                  <article class="task-card">

                      <div class="task-top">

                          <div>
                              <h4>
                                  ${escapeHtml(profile.full_name)}
                              </h4>

                              <p class="task-description">
                                  ${escapeHtml(
                                      formatRole(profile.role)
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
                              📊 ${metrics.completionRate}% completion rate
                          </span>

                      </div>

                  </article>
              `;
          })
          .join("");
}

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

      recurring_created:
          "created recurring schedule",

      recurring_paused:
          "paused recurring schedule",

      recurring_resumed:
          "resumed recurring schedule",

      recurring_generated:
          "generated recurring task"
  };

  return labels[action] || action;
}

function getActivityIcon(action) {
  const icons = {
      created:
          "＋",

      completed:
          "✓",

      reopened:
          "↻",

      archived:
          "□",

      restored:
          "↑",

      deleted:
          "✕",

      recurring_created:
          "↻",

      recurring_paused:
          "Ⅱ",

      recurring_resumed:
          "▶",

      recurring_generated:
          "＋"
  };

  return icons[action] || "•";
}

function getActivityBadgeClass(action) {
  if (
      action === "completed" ||
      action === "recurring_resumed"
  ) {
      return "priority-low";
  }

  if (
      action === "deleted" ||
      action === "archived" ||
      action === "recurring_paused"
  ) {
      return "priority-high";
  }

  return "priority-medium";
}

function renderActivityLog() {
  const summary =
      getElement("activityLogSummary");

  const list =
      getElement("activityLogList");

  const searchInput =
      getElement("activitySearchInput");

  const actionFilter =
      getElement("activityActionFilter");

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
      activityLogs.filter(log =>
          isToday(log.createdAt)
      );

  const createdCount =
      activityLogs.filter(
          log =>
              log.action === "created"
      ).length;

  const completedCount =
      activityLogs.filter(
          log =>
              log.action === "completed"
      ).length;

  const recurringCount =
      activityLogs.filter(
          log =>
              log.action.startsWith(
                  "recurring_"
              )
      ).length;

  summary.innerHTML = `
      <article class="stat-card">

          <div class="stat-icon red">
              01
          </div>

          <div>
              <p>Activity today</p>

              <strong>
                  ${todayLogs.length}
              </strong>

              <small>
                  Actions recorded today
              </small>
          </div>

      </article>

      <article class="stat-card">

          <div class="stat-icon amber">
              02
          </div>

          <div>
              <p>Tasks created</p>

              <strong>
                  ${createdCount}
              </strong>

              <small>
                  Recorded task creations
              </small>
          </div>

      </article>

      <article class="stat-card">

          <div class="stat-icon green">
              03
          </div>

          <div>
              <p>Tasks completed</p>

              <strong>
                  ${completedCount}
              </strong>

              <small>
                  Recorded completions
              </small>
          </div>

      </article>

      <article class="stat-card">

          <div class="stat-icon dark">
              04
          </div>

          <div>
              <p>Recurring actions</p>

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
      searchInput
          .value
          .trim()
          .toLowerCase();

  const selectedAction =
      actionFilter.value;

  const filteredLogs =
      activityLogs.filter(log => {
          const userName =
              getProfileName(log.userId);

          const searchableText = `
              ${userName}
              ${log.action}
              ${log.details}
          `.toLowerCase();

          const matchesSearch =
              !search ||
              searchableText.includes(search);

          let matchesAction =
              selectedAction === "all" ||
              log.action === selectedAction;

          if (
              selectedAction === "recurring"
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
                  getProfileName(log.userId);

              const label =
                  getActivityLabel(log.action);

              const icon =
                  getActivityIcon(log.action);

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
                                          .replaceAll("_", " ")
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

                          ${
                              log.taskId
                                  ? `
                                      <span>
                                          Task record available
                                      </span>
                                  `
                                  : `
                                      <span>
                                          Schedule or deleted-task record
                                      </span>
                                  `
                          }

                      </div>

                  </article>
              `;
          })
          .join("");
}

function calculateNextDueDate(
  dueDate,
  repeatType
) {
  const date =
      new Date(`${dueDate}T00:00:00`);

  if (repeatType === "daily") {
      date.setDate(
          date.getDate() + 1
      );
  } else if (
      repeatType === "weekly"
  ) {
      date.setDate(
          date.getDate() + 7
      );
  } else if (
      repeatType === "monthly"
  ) {
      const originalDay =
          date.getDate();

      date.setDate(1);

      date.setMonth(
          date.getMonth() + 1
      );

      const lastDay =
          new Date(
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

function createRecurringScheduleCard(schedule) {
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
                      ${escapeHtml(
                          schedule.priority.toUpperCase()
                      )}
                  </span>

                  ${statusBadge}

              </div>

          </div>

          <div class="task-meta">

              <span>
                  📅 Next: ${formatDate(schedule.nextDueDate)}
              </span>

              <span>
                  👤 ${escapeHtml(assignedName)}
              </span>

              <span>
                  🏬 ${escapeHtml(schedule.department)}
              </span>

              <span>
                  ＋ ${escapeHtml(
                      getProfileName(schedule.createdBy)
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

  if (!summary || !list) {
      return;
  }

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

  const dailySchedules =
      recurringSchedules.filter(
          schedule =>
              schedule.repeatType ===
              "daily"
      );

  const upcomingSchedules =
      activeSchedules.filter(schedule => {
          if (!schedule.nextDueDate) {
              return false;
          }

          const today =
              new Date();

          today.setHours(
              0,
              0,
              0,
              0
          );

          const sevenDaysLater =
              new Date(today);

          sevenDaysLater.setDate(
              today.getDate() + 7
          );

          const dueDate =
              new Date(
                  `${schedule.nextDueDate}T00:00:00`
              );

          return (
              dueDate >= today &&
              dueDate <= sevenDaysLater
          );
      });

  summary.innerHTML = `
      <article class="stat-card">

          <div class="stat-icon red">
              01
          </div>

          <div>
              <p>Active schedules</p>

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
              <p>Paused schedules</p>

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
              <p>Due in seven days</p>

              <strong>
                  ${upcomingSchedules.length}
              </strong>

              <small>
                  Upcoming repeat tasks
              </small>
          </div>

      </article>

      <article class="stat-card">

          <div class="stat-icon dark">
              04
          </div>

          <div>
              <p>Daily schedules</p>

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
              task.status === "completed"
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

  getElement("progressPercent").textContent =
      `${percentage}%`;

  getElement("progressRing")
      .style
      .setProperty(
          "--p",
          percentage
      );

  if (!activeTasks.length) {
      getElement("progressText").textContent =
          "No active tasks yet.";
  } else if (percentage === 100) {
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

async function createRecurringTask(
  taskData,
  repeatType
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
          .from("recurring_schedules")
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
                  true
          })
          .select()
          .single();

  if (scheduleError) {
      throw scheduleError;
  }

  const {
      error: taskError
  } =
      await supabaseClient
          .from("tasks")
          .insert({
              ...taskData,

              recurring_schedule_id:
                  schedule.id
          });

  if (taskError) {
      await supabaseClient
          .from("recurring_schedules")
          .delete()
          .eq("id", schedule.id);

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

  const assignedToUserId =
      getElement("taskAssignedTo")
          .value || null;

  const repeatType =
      getElement("taskRepeat")
          ?.value || "none";

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
      if (repeatType === "none") {
          const { error } =
              await supabaseClient
                  .from("tasks")
                  .insert(taskData);

          if (error) {
              throw error;
          }
      } else {
          await createRecurringTask(
              taskData,
              repeatType
          );
      }

      closeTaskModal();

      showToast(
          repeatType === "none"
              ? "Task added successfully."
              : "Recurring task schedule created."
      );

      await Promise.all([
          loadRecurringSchedules(),
          loadTasks(),
          canManageTasks()
              ? loadActivityLogs()
              : Promise.resolve()
      ]);
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

window.completeTask =
  async function(taskId) {
      if (!currentUser) {
          return;
      }

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

      const assignedElsewhere =
          task.assignedToUserId &&
          task.assignedToUserId !==
              currentUser.id;

      if (
          assignedElsewhere &&
          !canManageTasks()
      ) {
          showToast(
              "This task is assigned to another staff member."
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
              .eq("id", taskId);

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

      await Promise.all([
          loadRecurringSchedules(),
          loadTasks(),
          canManageTasks()
              ? loadActivityLogs()
              : Promise.resolve()
      ]);
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
              .eq("id", taskId);

      if (error) {
          showToast(
              `Could not reopen task: ${error.message}`
          );

          return;
      }

      showToast(
          "Task reopened."
      );

      await Promise.all([
          loadTasks(),
          loadActivityLogs()
      ]);
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
              .eq("id", taskId);

      if (error) {
          showToast(
              `Could not archive task: ${error.message}`
          );

          return;
      }

      showToast(
          "Task moved to archive."
      );

      await Promise.all([
          loadTasks(),
          loadActivityLogs()
      ]);
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
              .eq("id", taskId);

      if (error) {
          showToast(
              `Could not restore task: ${error.message}`
          );

          return;
      }

      showToast(
          "Task restored."
      );

      await Promise.all([
          loadTasks(),
          loadActivityLogs()
      ]);
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

      const { error } =
          await supabaseClient
              .from("tasks")
              .delete()
              .eq("id", taskId);

      if (error) {
          showToast(
              `Could not delete task: ${error.message}`
          );

          return;
      }

      showToast(
          "Task permanently deleted."
      );

      await Promise.all([
          loadTasks(),
          loadActivityLogs()
      ]);
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
              .from("recurring_schedules")
              .update({
                  active:
                      false,

                  updated_at:
                      new Date()
                          .toISOString()
              })
              .eq("id", scheduleId);

      if (error) {
          showToast(
              `Could not pause schedule: ${error.message}`
          );

          return;
      }

      showToast(
          "Recurring schedule paused."
      );

      await Promise.all([
          loadRecurringSchedules(),
          loadActivityLogs()
      ]);
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
              .from("recurring_schedules")
              .update({
                  active:
                      true,

                  updated_at:
                      new Date()
                          .toISOString()
              })
              .eq("id", scheduleId);

      if (error) {
          showToast(
              `Could not resume schedule: ${error.message}`
          );

          return;
      }

      showToast(
          "Recurring schedule resumed."
      );

      await Promise.all([
          loadRecurringSchedules(),
          loadActivityLogs()
      ]);
  };

function openTaskModal() {
  showElement("taskModal");

  updateRepeatFields();

  getElement("taskTitle")
      .focus();
}

function closeTaskModal() {
  hideElement("taskModal");

  getElement("taskForm")
      .reset();

  getElement("taskPriority").value =
      "medium";

  getElement("taskAssignedTo").value =
      "";

  if (getElement("taskRepeat")) {
      getElement("taskRepeat").value =
          "none";
  }

  updateRepeatFields();
}

function switchView(viewName) {
  const protectedViews = [
      "archive",
      "staffOverview",
      "activityLog",
      "recurringTasks"
  ];

  if (
      protectedViews.includes(viewName) &&
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

  getElement(
      `${viewName}View`
  )
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

  if (
      viewName === "activityLog" &&
      canManageTasks()
  ) {
      loadActivityLogs();
  }

  if (
      viewName === "recurringTasks" &&
      canManageTasks()
  ) {
      loadRecurringSchedules();
  }
}

function subscribeToRealtimeChanges() {
  if (realtimeChannel) {
      supabaseClient
          .removeChannel(
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
                  table: "activity_logs"
              },
              async () => {
                  if (canManageTasks()) {
                      await loadActivityLogs();
                  }
              }
          )
          .on(
              "postgres_changes",
              {
                  event: "*",
                  schema: "public",
                  table: "recurring_schedules"
              },
              async () => {
                  await loadRecurringSchedules();
              }
          )
          .subscribe();
}

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

      populateAssigneeDropdown();

      await loadRecurringSchedules();

      await loadTasks();

      if (canManageTasks()) {
          await loadActivityLogs();
      }

      setGreeting();

      updateUserDisplay();

      subscribeToRealtimeChanges();

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

  activityLogs = [];

  recurringSchedules = [];

  currentView = "dashboard";

  if (realtimeChannel) {
      supabaseClient
          .removeChannel(
              realtimeChannel
          );

      realtimeChannel = null;
  }

  hideElement("storeflowApp");

  showElement("loginScreen");

  getElement("loginForm")
      ?.reset();

  const loginError =
      getElement("loginError");

  if (loginError) {
      loginError.textContent = "";

      loginError.classList.add(
          "hidden"
      );
  }
}

function showToast(message) {
  const toast =
      getElement("toast");

  if (!toast) {
      return;
  }

  toast.textContent =
      message;

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

function updateRepeatFields() {
  const repeatSelect =
      getElement("taskRepeat");

  const helpLabel =
      getElement("repeatHelpLabel");

  const helpInput =
      getElement("repeatHelp");

  const dueDateInput =
      getElement("taskDueDate");

  const repeatLabel =
      getElement("taskRepeatLabel");

  if (
      !repeatSelect ||
      !helpLabel ||
      !helpInput
  ) {
      return;
  }

  if (!canManageTasks()) {
      repeatSelect.value = "none";

      repeatLabel?.classList.add(
          "hidden"
      );

      helpLabel.classList.add(
          "hidden"
      );

      return;
  }

  repeatLabel?.classList.remove(
      "hidden"
  );

  if (repeatSelect.value === "none") {
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
      repeatSelect.value === "daily"
  ) {
      helpInput.value =
          "A new task will be created every day after completion.";
  } else if (
      repeatSelect.value === "weekly"
  ) {
      helpInput.value =
          `Repeats every ${
              date.toLocaleDateString(
                  "en-AU",
                  {
                      weekday: "long"
                  }
              )
          }.`;
  } else {
      helpInput.value =
          `Repeats monthly on day ${date.getDate()}.`;
  }
}

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