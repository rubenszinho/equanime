import os
import tempfile

# Set before the app module opens its job database.
os.environ["EQUANIME_COLLECTOR_DB"] = os.path.join(tempfile.mkdtemp(), "jobs.sqlite")
