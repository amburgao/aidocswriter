"""A simple module to greet a user.

Args:
    name: The name of the user to greet.

Returns:
    None.
"""

import time


def main(name: str) -> None:
    """Prints a greeting with the current time.

    Args:
        name: The name to greet.
    """
    print(f"Hello {name}, the current time is: {time.time()}")
