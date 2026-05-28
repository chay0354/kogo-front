# Widget Page — Diagnosis Context

## Purpose
The widget page (`/widget`) is a **public, unauthenticated** embeddable enrollment form for parents. It has cascading dropdowns: City → Branch → Course/Lesson, then opens a registration drawer.

## File Map

| File | Role |
|------|------|
| `page.tsx` | Main page — cascading dropdowns + opens registration drawer |
| `CourseRegistrationForm.tsx` | Multi-step enrollment: details → discount → consents → payment |
| `types.ts` | TypeScript interfaces: City, Branch, Course, CourseLesson |
| `SignatureCanvas.tsx` | Digital signature input for consent step |

## API Calls Made by the Widget

### Dropdown loading (page.tsx)
1. `GET /api/v1/customers/widget/cities/` — loads city list
2. `GET /api/v1/customers/widget/branches/?city_id=X` — loads branches for selected city
3. `GET /api/v1/courses/courses/?branch_id=X&include_lessons=true` — **⚠️ BROKEN** (see below)

### Registration flow (CourseRegistrationForm.tsx)
4. `POST /api/v1/customers/widget/lookup/` — check parent ID + child name
5. `POST /api/v1/customers/widget/register/` — create family/child + initiate payment
6. `POST /api/v1/customers/widget/charge/` — process credit card

## Root Cause of the Bug

Call #3 hits `CourseViewSet` in `apps/courses/views.py`, which requires:
```python
permission_classes = [IsAuthenticated, IsManager]
```

The widget is public — no token in `localStorage` — so this request returns 401/403 and the courses dropdown never populates.

Calls #1, #2, #4, #5, #6 all hit `apps/customers/widget_views.py` where every view has `permission_classes = [AllowAny]` — those work fine.

## Fix

Add a new public `WidgetCoursesView` in `apps/customers/widget_views.py` following the same `AllowAny` pattern as the other widget views. The frontend then calls `/api/v1/customers/widget/courses/?branch_id=X` instead of the authenticated courses endpoint.

The new view should return: course id, name, lessons (id, day_of_week, start_time, end_time, price, available spots). Mirrors `CourseLesson` type in `types.ts`.
