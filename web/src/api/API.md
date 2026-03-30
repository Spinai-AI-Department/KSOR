# API Services

All services live in `src/services/` and communicate with the backend over HTTP.

## Setup

Set the backend URL in `.env.local`:

```
VITE_API_BASE_URL=http://localhost:8000
```

Defaults to `http://localhost:8000` if unset.

---

## client.ts

Base fetch wrapper used by all services. Attaches `Content-Type` and `Authorization` headers, parses JSON, and throws on non-2xx responses.

```ts
api.get<T>(path, token?)
api.post<T>(path, body, token?)
api.put<T>(path, body, token?)
api.patch<T>(path, body, token?)
api.delete<T>(path, token?)
```

Errors throw with `message` set to the backend's `detail` field.

---

## auth.ts — `/auth`

| Method | Endpoint | Description |
|---|---|---|
| `login(data)` | `POST /auth/login` | Returns `access_token` + user object |
| `getMe(token)` | `GET /auth/me` | Returns current user profile |
| `updateProfile(data, token)` | `PATCH /auth/me` | Update name, phone, specialty, department |
| `changePassword(data, token)` | `POST /auth/change-password` | Requires `current_password` + `new_password` |

**`AuthContext`** currently uses hardcoded demo accounts. When the backend is ready, replace the `login`, `updateUser`, and `changePassword` implementations in `src/app/context/AuthContext.tsx` with calls to `authService`.

---

## patients.ts — `/patients`

| Method | Endpoint | Description |
|---|---|---|
| `list(params, token)` | `GET /patients` | Paginated list with optional filters |
| `get(patientId, token)` | `GET /patients/:id` | Single patient detail |
| `create(data, token)` | `POST /patients` | Register a new patient |
| `update(patientId, data, token)` | `PATCH /patients/:id` | Update patient info |
| `delete(patientId, token)` | `DELETE /patients/:id` | Remove patient |
| `sendAlimtalk(data, token)` | `POST /patients/alimtalk` | Trigger Kakao AlimTalk to patient |

**List params:** `search_id`, `search_name`, `follow_up_period`, `page`, `page_size`

**`sendAlimtalk`** payload:
```ts
{ patient_id: string, follow_up_period: 'preOp' | 'm1' | 'm3' | 'm6' | 'yr1' }
```
The backend generates a one-time UUID PROM URL, embeds it in the AlimTalk template, and sends it to the patient's phone.

**Follow-up statuses:** `Completed` | `Pending` | `Not Due` | `Overdue`

---

## surgery.ts — `/surgeries`

| Method | Endpoint | Description |
|---|---|---|
| `list(patientId, token)` | `GET /patients/:id/surgeries` | All surgery records for a patient |
| `get(surgeryId, token)` | `GET /surgeries/:id` | Single surgery record |
| `create(data, token)` | `POST /surgeries` | Submit new surgery data entry |
| `update(surgeryId, data, token)` | `PATCH /surgeries/:id` | Edit a surgery record |
| `delete(surgeryId, token)` | `DELETE /surgeries/:id` | Remove a surgery record |

**Key fields:** `approach` (`Full-endo` | `UBE` | `Open`), `technique` (`interlaminar` | `transforaminal`), `implants`, `conversion_to_open`, `pre_op_proms` (VAS, ODI, EQ-5D, NDI).

---

## dashboard.ts — `/dashboard`

| Method | Endpoint | Description |
|---|---|---|
| `getData(token)` | `GET /dashboard` | Stats, VAS/ODI trend, surgery type distribution, recent follow-ups |

Response shape:
```ts
{
  stats: { total_surgeries, avg_op_time_min, complications_count, paper_count },
  vas_odi_trend: [{ month, back_vas, leg_vas, odi }],
  surgery_type_distribution: [{ name, value }],
  recent_follow_ups: [{ patient_id, status, date }]
}
```

---

## reports.ts — `/reports`

| Method | Endpoint | Description |
|---|---|---|
| `getData(params, token)` | `GET /reports?date_from=&date_to=` | Summary stats + monthly trend + outcomes by surgery type |
| `downloadPdf(params, token)` | `GET /reports/pdf?date_from=&date_to=` | Returns a `Blob` for browser download |

**Params:** `date_from` and `date_to` in `YYYY-MM-DD` format.
