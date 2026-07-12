# StoreFlow Skeleton

A mobile-friendly starter website for internal store task management.

## What this skeleton includes

- Manager dashboard
- Add task form
- Department and priority fields
- Search and filters
- Staff can mark tasks as completed
- Manager/owner role can archive, restore and permanently delete tasks
- Responsive phone layout
- Browser local storage for prototype data

## Important limitation

This is a front-end prototype. Data is stored in the current browser only.

That means:

- Tasks are not yet shared between devices
- The role selector is only a visual prototype
- It is not secure enough for real staff permissions yet

The next stage will connect Supabase authentication, database tables and Row Level Security.

## Open it locally

### Easiest method

Open `index.html` in a browser.

### Better method using VS Code

1. Open this folder in VS Code.
2. Install the **Live Server** extension.
3. Right-click `index.html`.
4. Select **Open with Live Server**.

## Publish using GitHub Pages

1. Sign in to GitHub.
2. Create a new repository called `storeflow`.
3. Keep it public for the simplest GitHub Pages setup.
4. Upload all files from this folder.
5. Open the repository **Settings**.
6. Select **Pages**.
7. Under **Build and deployment**, choose **Deploy from a branch**.
8. Choose the `main` branch and `/ (root)`.
9. Press **Save**.

The website should then appear at:

`https://YOUR-GITHUB-USERNAME.github.io/storeflow/`

## Suggested next development stage

1. Create a Supabase project.
2. Add `profiles`, `tasks` and `activity_logs` tables.
3. Add staff login.
4. Replace localStorage with Supabase queries.
5. Add proper manager/owner database permissions.
6. Add real-time updates so every device sees new tasks immediately.

## Prototype role behaviour

Use the **Viewing as** selector at the top:

- Staff: add and complete tasks
- Manager: add, complete, archive and delete tasks
- Owner: same control as manager

This selector is for testing only and must not be considered real security.
