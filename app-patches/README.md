# Quick add hooks for Flow and Finance

The dashboard's **+** button opens the other apps with a link. Garage already understands its link (`#add-fuel`).
Flow and Finance need one small change each so they read theirs:

| App | Link | What the app does |
|---|---|---|
| Flow | `?add=Pay TNB bill tmr 9am #home !high` | Reads it like its own quick-add box, asks you to confirm, adds the task |
| Finance | `?add=expense&amt=12.50&desc=Lunch` | Opens a new expense already filled in; you pick category and account, then Save. Does nothing in read-only mode |

Both remove the parameters from the address straight away, so a reload never adds twice.

## Apply

From each app's repository folder:

```bash
git apply /path/to/Dashboard/app-patches/flow-quick-add.patch
```

```bash
git apply /path/to/Dashboard/app-patches/finance-quick-add.patch
```

Each patch only adds lines to `index.html`.
