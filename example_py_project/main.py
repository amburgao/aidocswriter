"""A simple module to greet a user and show the current time.

Args:
    name: The name of the person to greet.
"""

import time


def main(name: str) -> None:
    """Prints a greeting with the current time.

    Args:
        name: The name of the person to greet.
    """
    print(f"Hello {name}, the current time is: {time.time()}")
