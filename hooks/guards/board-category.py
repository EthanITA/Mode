import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _gate import armed
if not armed():
    sys.exit(0)
from _transcript import CATEGORY, standard_prefix, store_task_path

try:
    data = json.loads(sys.stdin.read())
    subject = data.get("task_subject") or ""

    match = CATEGORY.match(subject)
    if not match:
        print(
            json.dumps(
                {
                    "decision": "block",
                    "reason": (
                        "Task subject %r has no category. Every board item declares what has to happen for it to "
                        "move — not who it is assigned to, which is the owner field's job. Re-create it as "
                        "\"[AI] %s\" if you can move it yourself right now, \"[USER] %s\" if it needs the user to "
                        "decide or to do something himself (including a task you own but are stalled on him for), "
                        "or \"[WAIT] %s\" if it is blocked on a third party such as CI, a review or an approval. "
                        "The id is stamped automatically once the category is there."
                        % (subject, subject, subject, subject)
                    ),
                }
            )
        )
        sys.exit(0)

    # TaskCreate assigns the id too late for the subject; stamping here closes the id-less window.
    task_id = str(data.get("task_id") or "")
    stamped = standard_prefix(match.group(1).upper(), task_id) + subject[match.end():].lstrip()
    path = store_task_path(data.get("session_id"), task_id)
    if task_id and subject != stamped and os.path.exists(path):
        with open(path) as f:
            task = json.load(f)
        task["subject"] = stamped
        with open(path, "w") as f:
            json.dump(task, f, indent=2)
except Exception:
    pass

sys.exit(0)
