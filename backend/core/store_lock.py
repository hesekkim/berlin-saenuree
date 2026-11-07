"""The single lock that guards every JSON store and the media reference set.

One reentrant lock means there is no lock order to get wrong: code that holds
it may call any other store function on the same thread. Keep the critical
sections short and do CPU or image work before taking the lock.
"""

import threading

STORE_LOCK = threading.RLock()
