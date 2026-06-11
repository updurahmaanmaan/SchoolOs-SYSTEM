**SchoolOS — Project Summary (simple language)**

- **Project root**: contains multiple app folders: `SchoolsOs`, `Parent`, and shared `backend` scaffolding for the SchoolsOs app.

**Folders & high-level purpose**
- **SchoolsOs/**: The manager/principal dashboard and its backend. Main app for school staff.
  - **[SchoolsOs/SchoolOS.html](SchoolsOs/SchoolOS.html)**: Main HTML page for the principal dashboard (UI shell).
  - **[SchoolsOs/SchoolOs.css](SchoolsOs/SchoolOs.css)**: Styling for the principal dashboard.
  - **[SchoolsOs/SchoolOs.js](SchoolsOs/SchoolOs.js)**: The entire front-end app logic (renders dashboard, students, attendance, grades, timetable, classes). Also saves/loads data to `localStorage` when used without backend.
  - **[SchoolsOs/backend/](SchoolsOs/backend/)**: Node/Express API that the dashboard can use for real data.
    - **[SchoolsOs/backend/server.js](SchoolsOs/backend/server.js)**: Starts the Express server and mounts API routes.
    - **[SchoolsOs/backend/package.json](SchoolsOs/backend/package.json)**: Lists dependencies and start scripts.
    - **[SchoolsOs/backend/.env.example](SchoolsOs/backend/.env.example)**: Example environment vars (`MONGO_URI`, `JWT_SECRET`).
    - **[SchoolsOs/backend/README.md](SchoolsOs/backend/README.md)**: Quick instructions to run the backend and available API endpoints.
    - **[SchoolsOs/backend/config/db.js](SchoolsOs/backend/config/db.js)**: Connects to MongoDB using `mongoose`.
    - **[SchoolsOs/backend/middleware/auth.js](SchoolsOs/backend/middleware/auth.js)**: Verifies JWT from `Authorization: Bearer <token>` and sets `req.user` for protected routes.
    - **[SchoolsOs/backend/models/**]: Mongoose models that define data shapes:
      - **[SchoolsOs/backend/models/User.js](SchoolsOs/backend/models/User.js)**: User schema (principal), hashes passwords, compares passwords.
      - **[SchoolsOs/backend/models/Student.js](SchoolsOs/backend/models/Student.js)**: Student records (name, class, attendance, exams, createdBy).
      - **[SchoolsOs/backend/models/Timetable.js](SchoolsOs/backend/models/Timetable.js)**: Timetable structure (periods, slots, owner).
      - **[SchoolsOs/backend/models/ClassForm.js](SchoolsOs/backend/models/ClassForm.js)**: Defines forms/classes list.
    - **[SchoolsOs/backend/routes/**]: API routes (all expect authenticated principal via JWT in header):
      - **[SchoolsOs/backend/routes/auth.js](SchoolsOs/backend/routes/auth.js)**: `POST /api/auth/register` and `POST /api/auth/login` (returns JWT).
      - **[SchoolsOs/backend/routes/students.js](SchoolsOs/backend/routes/students.js)**: CRUD for students (`GET`, `POST`, `PUT /:id`, `DELETE /:id`).
      - **[SchoolsOs/backend/routes/classes.js](SchoolsOs/backend/routes/classes.js)**: CRUD for class forms and classes.
      - **[SchoolsOs/backend/routes/timetable.js](SchoolsOs/backend/routes/timetable.js)**: Get/update timetable for the logged-in principal.

- **Parent/**: The parent portal (used by parents to search and view a child's school data).
  - **[Parent/parent.html](Parent/parent.html)**: Parent portal HTML (UI shell and inline CSS).
  - **[Parent/parent.js](Parent/parent.js)**: (empty in this workspace) placeholder for parent JS logic.
  - **[Parent/parent.css](Parent/parent.css)**: (empty) placeholder for parent styles.
  - **[Parent/Logins/**]: Simple client-side auth used by both portals (stores users in `localStorage` for demo mode):
    - **[Parent/Logins/auth.html](Parent/Logins/auth.html)**: Login / signup UI for principals and parents.
    - **[Parent/Logins/auth.js](Parent/Logins/auth.js)**: Handles signup/login flows using `localStorage` (`schoolos_users`), encodes passwords with `btoa`, sets `schoolos_session` and redirects to the proper app.
    - **[Parent/Logins/auth.css](Parent/Logins/auth.css)**: Styles for the login pages.

- **SchoolsOs/Database/**: contains VS Code workspace file `SchoolOs.code-workspace` (editor configuration).

**How the pieces work together (simple)**
- The login page (`Parent/Logins/auth.html` + `auth.js`) is used to create accounts for principals and parents (stored locally for demo).
- A principal logs in and opens the principal dashboard (`SchoolsOs/SchoolOS.html`), which runs `SchoolOs.js`. That front-end can work alone using data saved in `localStorage` or talk to the backend API.
- If you run the backend (`SchoolsOs/backend/`), `server.js` connects to MongoDB via `config/db.js`. The API routes under `/api/*` let the front-end store and retrieve real data. Authentication uses JWTs issued by `routes/auth.js` and enforced by `middleware/auth.js`.
- Models define the shape of data in MongoDB (users, students, timetables, class forms). Routes implement CRUD operations.

**Quick notes to save or edit**
- To run backend locally: copy `.env.example` → `.env`, set `MONGO_URI` and `JWT_SECRET`, then:

```bash
cd SchoolsOs/backend
npm install
npm run dev
```

- For a quick demo without backend: use the login/signup UI in `Parent/Logins/auth.html` and open `SchoolsOs/SchoolOS.html` and `Parent/parent.html` in the browser; they use `localStorage` to store data.

---
Saved file: `SCHOOLOS_SUMMARY.md` (root of your workspace). You can edit this file to add more details or ask me to expand any section.
