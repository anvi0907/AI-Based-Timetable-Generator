from flask import Flask, render_template, request, jsonify, send_file
from datetime import datetime, timedelta
import random, io, csv

app = Flask(__name__)

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

TYPE_COLORS = {
    "Lecture":   "#6c63ff",
    "Practical": "#10b981",
    "Tutorial":  "#f59e0b",
}


def fmt(dt):
    return dt.strftime("%H:%M")


def build_day_slots(start, duration, lunch_duration, lunch_after):
    """
    Build ordered slot list for ONE day.
    lunch_after: insert lunch break after this many lectures (3 or 4).
    Returns list of dicts: {slot, end, is_lunch}
    """
    current = start
    slots = []
    count = 0
    lunch_done = False

    while True:
        # Insert lunch after `lunch_after` lectures
        if not lunch_done and count == lunch_after:
            lunch_end = current + timedelta(minutes=lunch_duration)
            slots.append({"slot": fmt(current), "end": fmt(lunch_end), "is_lunch": True})
            current = lunch_end
            lunch_done = True

        slot_end = current + timedelta(minutes=duration)
        slots.append({"slot": fmt(current), "end": fmt(slot_end), "is_lunch": False})
        current = slot_end
        count += 1

        # Stop when we've added enough slots (cap at 8 teaching slots per day)
        if count >= 8:
            break

    return slots


def build_schedule_template(start_str, end_str, duration, lunch_duration):
    """
    Build per-day slot lists. Each day independently picks lunch after 3 or 4 lectures.
    Returns: { day: [slot_dict, ...] }
    """
    fmt_in = "%H:%M"
    start = datetime.strptime(start_str, fmt_in)
    end   = datetime.strptime(end_str,   fmt_in)
    total_minutes = (end - start).seconds // 60

    day_slots = {}
    for day in DAYS:
        lunch_after = random.choice([3, 4])
        slots = build_day_slots(start, duration, lunch_duration, lunch_after)
        # Trim slots that go past end time
        slots = [s for s in slots if not s["is_lunch"] and
                 datetime.strptime(s["end"], fmt_in) <= end + timedelta(minutes=1)
                 or s["is_lunch"]]
        day_slots[day] = slots

    return day_slots


def slots_needed(class_type, periods):
    """Use explicit periods count (1 or 2). Practicals default to 2 if not specified."""
    if periods:
        return int(periods)
    return 2 if class_type == "Practical" else 1


def can_place(schedule, day, slot_idx, n_slots, teacher, global_teacher_busy, day_slots):
    """Check if n_slots consecutive teaching slots starting at slot_idx are free,
    and that no lunch break falls between them."""
    teaching = [s for s in day_slots[day] if not s["is_lunch"]]
    if slot_idx + n_slots > len(teaching):
        return False

    if n_slots > 1:
        first_slot_time = teaching[slot_idx]["slot"]
        last_slot_time  = teaching[slot_idx + n_slots - 1]["slot"]
        full = day_slots[day]
        first_pos = next(i for i, s in enumerate(full) if s["slot"] == first_slot_time)
        last_pos  = next(i for i, s in enumerate(full) if s["slot"] == last_slot_time)
        for pos in range(first_pos + 1, last_pos):
            if full[pos]["is_lunch"]:
                return False

    for i in range(n_slots):
        s = teaching[slot_idx + i]
        key = (day, s["slot"])
        if schedule[day].get(s["slot"]) is not None:
            return False
        if key in global_teacher_busy.get(teacher, set()):
            return False
    return True


def subject_already_on_day(schedule, day, subject):
    """Return True if this subject already has a class on this day."""
    return any(
        v is not None and v.get("subject") == subject and not v.get("continuation")
        for v in schedule[day].values()
    )


def place(schedule, day, slot_idx, entry, n_slots, teacher, global_teacher_busy, day_slots):
    teaching = [s for s in day_slots[day] if not s["is_lunch"]]
    for i in range(n_slots):
        s = teaching[slot_idx + i]
        key = (day, s["slot"])
        schedule[day][s["slot"]] = {**entry, "continuation": i > 0}
        global_teacher_busy.setdefault(teacher, set()).add(key)


def generate_all(sections, combined, day_slots, global_teacher_busy):
    # schedule[section][day][slot] = entry | None
    schedules = {
        sec["name"]: {day: {s["slot"]: None for s in day_slots[day] if not s["is_lunch"]}
                      for day in DAYS}
        for sec in sections
    }

    unscheduled_per = {sec["name"]: [] for sec in sections}

    # --- Combined classes first ---
    for cb in combined:
        cb_secs = cb["sections"]
        n = slots_needed(cb["type"], cb.get("periods", None))
        entry = {"subject": cb["subject"], "teacher": cb["teacher"],
                 "type": cb["type"], "combined": True}
        for _ in range(int(cb["weekly_classes"])):
            placed = False
            combos = [(d, i) for d in DAYS
                      for i in range(len([s for s in day_slots[d] if not s["is_lunch"]]))]
            random.shuffle(combos)
            for day, idx in combos:
                if all(can_place(schedules[sn], day, idx, n, cb["teacher"], global_teacher_busy, day_slots)
                       for sn in cb_secs if sn in schedules):
                    for sn in cb_secs:
                        if sn in schedules:
                            place(schedules[sn], day, idx, entry, n, cb["teacher"], global_teacher_busy, day_slots)
                    placed = True
                    break
            if not placed:
                for sn in cb_secs:
                    unscheduled_per.setdefault(sn, []).append(entry)

    # --- Per-section classes ---
    for sec in sections:
        sn = sec["name"]
        all_classes = []
        for t in sec["teachers"]:
            n = slots_needed(t["type"], t.get("periods", None))
            for _ in range(int(t["weekly_classes"])):
                all_classes.append({"subject": t["subject"], "teacher": t["name"],
                                    "type": t["type"], "combined": False, "slots_needed": n})
        random.shuffle(all_classes)

        for cls in all_classes:
            n = cls["slots_needed"]
            placed = False
            # Try days that don't already have this subject first (spread constraint)
            preferred = [d for d in DAYS if not subject_already_on_day(schedules[sn], d, cls["subject"])]
            fallback  = [d for d in DAYS if d not in preferred]
            pref_combos = [(d, i) for d in preferred for i in range(len([s for s in day_slots[d] if not s["is_lunch"]]))]
            fall_combos = [(d, i) for d in fallback  for i in range(len([s for s in day_slots[d] if not s["is_lunch"]]))]
            random.shuffle(pref_combos)
            random.shuffle(fall_combos)
            combos = pref_combos + fall_combos

            for day, idx in combos:
                if can_place(schedules[sn], day, idx, n, cls["teacher"], global_teacher_busy, day_slots):
                    place(schedules[sn], day, idx, cls, n, cls["teacher"], global_teacher_busy, day_slots)
                    placed = True
                    break
            if not placed:
                unscheduled_per[sn].append(cls)

    # --- Build grid (merge day_slots with schedule data) ---
    results = []
    for sec in sections:
        sn = sec["name"]
        grid = {}
        for day in DAYS:
            grid[day] = []
            for s in day_slots[day]:
                if s["is_lunch"]:
                    grid[day].append({"slot": s["slot"], "end": s["end"], "is_lunch": True})
                else:
                    entry = schedules[sn][day].get(s["slot"])
                    # For continuation slots, find the parent entry (first slot of the pair)
                    if entry and entry.get("continuation"):
                        # Walk back to find the parent
                        teaching = [x for x in day_slots[day] if not x["is_lunch"]]
                        t_idx = next((k for k, x in enumerate(teaching) if x["slot"] == s["slot"]), None)
                        parent_entry = None
                        if t_idx is not None and t_idx > 0:
                            parent_slot = teaching[t_idx - 1]["slot"]
                            parent_entry = schedules[sn][day].get(parent_slot)
                        grid[day].append({
                            "slot": s["slot"], "end": s["end"], "is_lunch": False,
                            "entry": entry, "parent_entry": parent_entry
                        })
                    else:
                        grid[day].append({
                            "slot": s["slot"], "end": s["end"], "is_lunch": False,
                            "entry": entry
                        })

        unscheduled = unscheduled_per[sn]
        sec_total = sum(int(t["weekly_classes"]) for t in sec["teachers"])
        cb_total  = sum(int(c["weekly_classes"]) for c in combined if sn in c["sections"])
        scheduled = (sec_total + cb_total) - len(unscheduled)

        results.append({
            "section": sn,
            "grid": grid,
            "unscheduled": [{"subject": u["subject"], "teacher": u["teacher"]} for u in unscheduled],
            "stats": {"total": sec_total + cb_total, "scheduled": scheduled, "unscheduled": len(unscheduled)}
        })

    return results


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/generate", methods=["POST"])
def api_generate():
    data     = request.get_json()
    sections = data.get("sections", [])
    combined = data.get("combined", [])
    config   = data.get("config", {})

    if not sections:
        return jsonify({"error": "No sections provided"}), 400

    start    = config.get("start", "09:30")
    end      = config.get("end",   "16:25")
    duration = int(config.get("duration", 50))
    lunch_duration = int(config.get("lunch_duration", 60))

    day_slots = build_schedule_template(start, end, duration, lunch_duration)

    # --- Capacity check ---
    # Total teaching slots available per section per week
    slots_per_day = {d: len([s for s in day_slots[d] if not s["is_lunch"]]) for d in DAYS}
    total_slots_per_week = sum(slots_per_day.values())  # across all 5 days

    for sec in sections:
        # Count total slot-periods needed (2-period class = 2 slots)
        needed = sum(
            slots_needed(t["type"], t.get("periods")) * int(t["weekly_classes"])
            for t in sec["teachers"]
        )
        # Add combined classes that include this section
        needed += sum(
            slots_needed(c["type"], c.get("periods")) * int(c["weekly_classes"])
            for c in combined if sec["name"] in c.get("sections", [])
        )
        if needed > total_slots_per_week:
            return jsonify({
                "error": (
                    f"Section '{sec['name']}' needs {needed} slot-periods but only "
                    f"{total_slots_per_week} are available per week "
                    f"({', '.join(f'{d}: {slots_per_day[d]}' for d in DAYS)}). "
                    f"Reduce classes or extend the schedule."
                )
            }), 400

    global_teacher_busy = {}
    results = generate_all(sections, combined, day_slots, global_teacher_busy)

    total_scheduled   = sum(r["stats"]["scheduled"]   for r in results)
    total_unscheduled = sum(r["stats"]["unscheduled"] for r in results)

    return jsonify({
        "days": DAYS,
        "day_slots": {d: day_slots[d] for d in DAYS},
        "sections": results,
        "stats": {"total_scheduled": total_scheduled, "total_unscheduled": total_unscheduled}
    })


@app.route("/api/export/csv", methods=["POST"])
def export_csv():
    data         = request.get_json()
    grid         = data.get("grid", {})
    section_name = data.get("section", "timetable")
    days         = data.get("days", DAYS)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Time"] + days)

    # Find max rows across days
    max_rows = max((len(grid.get(d, [])) for d in days), default=0)
    for i in range(max_rows):
        row = []
        slot_label = ""
        for day in days:
            slots = grid.get(day, [])
            if i >= len(slots):
                row.append("")
                continue
            s = slots[i]
            if s.get("is_lunch"):
                slot_label = slot_label or f"{s['slot']}–{s['end']}"
                row.append("LUNCH BREAK")
            else:
                slot_label = slot_label or f"{s['slot']}–{s['end']}"
                e = s.get("entry")
                if e and not e.get("continuation"):
                    tag = " [combined]" if e.get("combined") else ""
                    row.append(f"[{e['type']}] {e['subject']} ({e['teacher']}){tag}")
                elif e and e.get("continuation"):
                    row.append("↑ cont.")
                else:
                    row.append("FREE")
        writer.writerow([slot_label] + row)

    output.seek(0)
    filename = f"timetable_{section_name}.csv".replace(" ", "_")
    return send_file(
        io.BytesIO(output.getvalue().encode()),
        mimetype="text/csv",
        as_attachment=True,
        download_name=filename
    )


if __name__ == "__main__":
    app.run(debug=True)
