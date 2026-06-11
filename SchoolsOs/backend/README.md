# SchoolOs Backend

A minimal Node.js + Express backend using MongoDB for the SchoolOs app.

Quick start

1. Copy `.env.example` to `.env` and set `MONGO_URI` and `JWT_SECRET`.

2. Install dependencies:

```bash
cd backend
npm install
```

3. Start the dev server:

```bash
npm run dev
```

API endpoints

- `POST /api/auth/register` — register principal
- `POST /api/auth/login` — login (returns JWT)
- `GET /api/students` — protected: list students
- `POST /api/students` — protected: add student
- `PUT /api/students/:id` — protected: update student
- `DELETE /api/students/:id` — protected: remove student
- `GET /api/classes` — protected: list forms and classes
- `POST /api/classes` — add form/class
- `GET /api/timetable` — get timetable
- `PUT /api/timetable` — update timetable

Use the JWT returned by `/api/auth/login` as `Authorization: Bearer <token>`.
