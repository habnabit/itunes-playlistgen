from setuptools import setup


setup(
    name='playlistgen',
    author='Aaron Gallagher',
    author_email='_@habnab.it',

    install_requires=[
        'PyObjC',
        'attrs',
        'backports.statistics',
        'click',
        'py-applescript',
    ],
    entry_points={
        'console_scripts': [
            'playlistgen = playlistgen:main',
        ],
    },

    py_modules=['playlistgen'],
)
