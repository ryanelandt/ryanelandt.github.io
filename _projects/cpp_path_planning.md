---
layout: page
title: C++ Project
description: Path planning with charging
img:
importance: 2
category: work
---

### Interactive planner

<!-- <style>
.highlight-left {margin-left: 0}
canvas { position: relative; top: 0;}
</style> -->


<div id="canvas-holder"></div>


<script type="module" src="../../assets/my_js/flight_planner_app.js"></script>
<script src="../../assets/my_js/flight_planner.js"></script> 

<!-- <style>
.caption {
  font-size: 20px; /* Adjust the value to increase or decrease the font size */
}
</style> -->


<!--
http://127.0.0.1:4000/projects/cpp_path_planning/
-->

<div class="caption" style="font-size: 16px;">
<strong>Click</strong> on cities to find the fastest route.
</div>

#### **Context**

I created a path planner for a small electric plane to address the lack of publicly available C++ projects on my GitHub.
The problem statement for this project can be found
[here](https://github.com/ryanelandt/path_planning_with_charging/blob/main/problem_statement.md).
My solution is available on GitHub [here](https://github.com/ryanelandt/path_planning_with_charging).
I compiled this C++ code into WebAssembly and used it to create the interactive path planner above.
I created the graphical elements of this application with the [three.js](https://threejs.org/) library.

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






