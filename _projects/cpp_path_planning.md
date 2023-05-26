---
layout: page
title: C++ Project
description: Path planning with charging
img:
importance: 2
category: work
---

### Click the map below to connect two cities

<div id="canvas-holder"></div>

<script type="module" src="../../assets/my_js/flight_planner_app.js">
</script>

<div class="caption" style="font-size: 16px;">
<strong>Click</strong> on cities to find the fastest route.
</div>

#### **Context**

This [GitHub repository](https://github.com/ryanelandt/path_planning_with_charging) contains a path planner I developed for the small electric plane described in [this problem statement](https://github.com/ryanelandt/path_planning_with_charging/blob/main/problem_statement.md).
I undertook this project to publicly showcase my C++ abilities, as my other C++ projects are private.
To visualize my planner's output, I first used [Emscripten](https://emscripten.org/) to compile my C++ code into WebAssembly.
I then used the [three.js](https://threejs.org/) JavaScript library to create an interactive map to run this WebAssembly module.


#### **Problem overview**

A company is developing a small electric plane.
This plane uses batteries so it has a limited range.
To support cross country travel, the company intends to create a network of charging stations at small airports across the United States.
The plane charges faster at some stations than at others, and doesn't need to fully charge at any one station. The company wants you to design an algorithm to find the minimum time path between any two of these airports.


#### **Repository overview**

My solution to this problem is described in detail in the [README file](https://github.com/ryanelandt/path_planning_with_charging/blob/main/readme.md) of my GitHub repository.
Explore this project to see how I transform this solution into modular, maintainable, and tested C++ code.
Thank you for taking the time to look at my project.
If you see something I can improve, please let me know by opening a GitHub issue.






