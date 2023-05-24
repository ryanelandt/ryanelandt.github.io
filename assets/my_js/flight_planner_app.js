// import * as THREE from 'three';
// import * as THREE from './three.module.js';
import * as THREE from './three.module.min.js';

let canvas_holder, canvas_sizer;
let camera, scene, raycaster, renderer;

let helper_cpp;
let path_rad = 1.5;
let v_cylinders = [];

let rgb_puck_inner = 0xffddbb;
let rgb_puck_outer = 0x398464;
let rgb_path = 0x88722E;

// Geometry Control Panel
let puck_size = 3.5;
let puck_height = 0.4;
let puck_dist_lower = 500;
var puck_dist_prop = 1.0001;

const pointer = new THREE.Vector2();
const frustumSize = 215;

// custom global variables
var vStartEndCity = [];
var vCity = [];
var v_city_puck_inner = [];
var v_city_puck_outer = [];
var dictObIdToCityId = {};




////////////////////////////////


class CanvasSizer {
  constructor(canvas_holder, renderer) {
    this.aspect_ratio_ = 1.7;
    this.width_min_ = 400;
    this.canvas_holder_ = canvas_holder;
    this.renderer_ = renderer;
    this.set_size();
    this.print_size();
  }

  calc_camera() {
    return new THREE.OrthographicCamera(
      frustumSize * this.aspect_ratio_ / - 2,
      frustumSize * this.aspect_ratio_ / 2,
      frustumSize / 2,
      frustumSize / - 2, 1, 1000
    );
  }

  set_size() {
    const height = this.width() / this.aspect_ratio();
    this.canvas_holder().style.height = height + "px";
    this.renderer_.setSize(this.width(), height);    
    this.print_size();
  }
  
  print_size() { 
    const width = this.width();
    const height = this.height();
    console.log("width: " + width + " height: " + height);
  }
  
  aspect_ratio() { return this.aspect_ratio_; }
  width_min() { return this.width_min_; }
  canvas_holder() { return this.canvas_holder_; }
  
  width() { return this.canvas_holder().clientWidth; }
  height() { return this.canvas_holder().clientHeight; }
}



class City {
  // Position is a THREE.Vector3
  constructor(id, position) {
    this.id = id;
    this.position = position;
  }

  getId() { return this.id; }
  getPosition() { return this.position; }
}

class HelperCppPointer {
  constructor(d_type, tuple_size) {
    // Assert d_type is int or double
    if (d_type != 'int' && d_type != 'double') {
      throw new Error('d_type must be int or double');
    }

    // Assert tuple_size has exactly 2 integers
    if (tuple_size.length != 2) {
      throw new Error('tuple_size must have exactly 2 integers');
    }

    var n_max = tuple_size[0] * tuple_size[1];  // Get the maximum number of elements
    
    // 4 bytes for int, 8 bytes for double
    var n_bytes_per_dtype = d_type == 'int' ? 4 : 8;
    
    // Allocate memory for the data pointer
    this.dataPtr = Module._malloc(n_bytes_per_dtype * n_max);
    
    this.n_max = n_max;
    this.lengthPtr = Module._malloc(4);  // Allocate 4 bytes for an integer pointer
  }
  
  getDataPtr() { return this.dataPtr; }  // Returns the data pointer
  getLengthPtr() { return this.lengthPtr; }  // Returns the length pointer
  getData() { return this.data; }  // Returns the data array
  getLength() { return Module.getValue(this.lengthPtr, 'i32'); }  // Returns the length

  free() {
    Module._free(this.dataPtr);
    Module._free(this.lengthPtr);
  }
}


function loadCityData(helper) {
  var lengthPtr = helper.getLengthPtr();
  var dataPtr = helper.getDataPtr();
  
  var fun_name = 'voidAirportXyz';
  puck_dist_lower = 500;
  
  Module.ccall( 
    fun_name,
    'void',
    ['number', 'number'], 
    [dataPtr, lengthPtr],
  );
    
  var linear_city_xyz = new Float64Array(Module.HEAPF64.buffer, helper.dataPtr, helper.n_max);
  
  // Create JavaScript array from typed array
  var resultArray = [];
  for (var i = 0; i < helper.getLength(); i += 3) {
    resultArray.push([
      linear_city_xyz[i]     * puck_dist_lower,
      linear_city_xyz[i + 1] * puck_dist_lower,
      linear_city_xyz[i + 2] * puck_dist_lower
    ]);
  }

  return resultArray;
}


function loadPathReal(helper, id_src, id_dst) {
  var lengthPtr = helper.getLengthPtr();
  var dataPtr = helper.getDataPtr();

  Module.ccall(
    'voidPathOutReal',
    'void',
    ['number', 'number', 'number', 'number'],
    [dataPtr, lengthPtr, id_src, id_dst],
  );

  var linear_path = new Float64Array(Module.HEAPF64.buffer, helper.dataPtr, helper.n_max);

  // Create JavaScript array from typed array
  var resultArray = [];
  for (var i = 0; i < helper.getLength(); ++i) {
    var ind_double = linear_path[i];

    // Converts to integer -- Asserts is exactly an integer
    var ind = Math.round(ind_double);
    if (ind != ind_double) { throw new Error('ind is not an integer'); }
    resultArray.push(ind);
  }

  return resultArray;
}

function createCylGeoForHeight(r, h) { return new THREE.CylinderGeometry(r, r, h, 16, 1, false); }
function createNewCylinder(r) {
  const geometry = createCylGeoForHeight(r, 1);
  
  // Create the material
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Green color for the cylinder

  // Create the mesh and position it
  const cylinder = new THREE.Mesh(geometry, material); 
  scene.add(cylinder);
  return cylinder;
}

function adjustCylinder(cylinder, xyz_0, xyz_1, is_reuse_height=false) {
  // Same as the 3 lines above, but on 1 line
  const [x0, y0, z0] = xyz_0;
  const [x1, y1, z1] = xyz_1;

  var height = 100;
  if (is_reuse_height) {
    height = cylinder.geometry.parameters.height; // Height of the cylinder
  } else {
    height = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2 + (z1 - z0) ** 2); // Height of the cylinder
  }

  // Sets the height of the cylinder
  const c_rad = cylinder.geometry.parameters.radiusTop;
  cylinder.geometry.dispose();
  cylinder.geometry = createCylGeoForHeight(c_rad, height);

  // Set the position of the cylinder to the midpoint of the two points
  cylinder.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

  // Set the direction of the cylinder
  const direction = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize();
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
}

function adjustRaise(obj_in) {
  const xyz = obj_in.position;
  // Assert that xyz is not the zero vector
  if (xyz.x == 0 && xyz.y == 0 && xyz.z == 0) { throw new Error('xyz is the zero vector'); }
  xyz.normalize();
  xyz.multiplyScalar(puck_dist_lower * puck_dist_prop);
  obj_in.position.set(xyz.x, xyz.y, xyz.z);
}

function adjustLower(obj_in) {
  const xyz = obj_in.position;
  // Assert that xyz is not the zero vector
  if (xyz.x == 0 && xyz.y == 0 && xyz.z == 0) { throw new Error('xyz is the zero vector'); }
  xyz.normalize();
  xyz.multiplyScalar(puck_dist_lower);
  obj_in.position.set(xyz.x, xyz.y, xyz.z);
}

function initGeometry() {
  console.log("Initializing Emscripten module");  // Log to console

  // Initialize Emscripten module
  Module.onRuntimeInitialized = function () {
    helper_cpp = new HelperCppPointer('double', [303, 4]);
    var resultArray = loadCityData(helper_cpp);

    console.log(resultArray);

    // Add cities to vCity
    for (let i = 0; i < resultArray.length; i++) {
      const city = new City(i, new THREE.Vector3(resultArray[i][0], resultArray[i][1], resultArray[i][2]));
      vCity.push(city);
    }

    // Log number of cities
    console.log("Number of cities: " + vCity.length);

    const puck_inner = createCylGeoForHeight(puck_size, puck_height);
    
    var outlineGeometry = createCylGeoForHeight(puck_size * 2.0, puck_height * 0.5);
    var outlineMaterial = new THREE.MeshBasicMaterial( { color: rgb_puck_outer, side: THREE.BackSide } );
    
    // Iterate over vCity
    for (let i = 0; i < vCity.length; i++) {
      const object = new THREE.Mesh( puck_inner,
        new THREE.MeshBasicMaterial( {
          color: rgb_puck_inner,
        } )
      );
      
      const position_i = vCity[i].getPosition();

      object.material.depthTest = true;
      adjustCylinder(object, [0, 0, 0], position_i, true);
      
      var outlineMesh = new THREE.Mesh( outlineGeometry, outlineMaterial );
      adjustCylinder(outlineMesh, [0, 0, 0], position_i, true);
      
      object.position.set( vCity[i].getPosition().x, vCity[i].getPosition().y, vCity[i].getPosition().z );
      outlineMesh.position.set( vCity[i].getPosition().x, vCity[i].getPosition().y, vCity[i].getPosition().z );

      var group = new THREE.Group();
      group.add( object );
      group.add( outlineMesh );
      scene.add( group );
      
      v_city_puck_inner.push(object);
      v_city_puck_outer.push(outlineMesh);
      dictObIdToCityId[object.id] = i;
      dictObIdToCityId[outlineMesh.id] = i;
    }
  };
}


init();
animate();

function init() {
  // Define the scene
  scene = new THREE.Scene();
  // scene.background = new THREE.Color( 0xf0f0f0 );
  scene.background = new THREE.Color( 0xc0c0c0 );

  // Add a light
  const light = new THREE.DirectionalLight( 0xffffff, 1 );
  light.position.set( -150, -1050, 800).normalize();
  scene.add( light );

  // Define the renderer
  renderer = new THREE.WebGLRenderer();
  renderer.setPixelRatio( window.devicePixelRatio );

  // Gets the canvas-holder html element
  canvas_holder = document.getElementById("canvas-holder");
  canvas_sizer = new CanvasSizer(canvas_holder, renderer);

  // Define the raycaster
  raycaster = new THREE.Raycaster();
  initGeometry();
  
  camera = canvas_sizer.calc_camera();
  canvas_holder.appendChild( renderer.domElement );

  // Add event listeners
	document.addEventListener( 'mousedown', onDocumentMouseDown, false );
  window.addEventListener( 'resize', onWindowResize );
}

function findIdCityClicked(raycaster) {
  // Find intersections with inner pucks
  const intersects = raycaster.intersectObjects( v_city_puck_inner, true );
  if (intersects.length != 0) {
    return dictObIdToCityId[intersects[0].object.id];
  }

  // Find intersections with outer pucks
  const intersects_outer = raycaster.intersectObjects( v_city_puck_outer, true );
  if (intersects_outer.length != 0) { 
    const obj_outer = intersects_outer[0];
    return dictObIdToCityId[obj_outer.object.id];
  }
  
  return null;
}

function onDocumentMouseDown( event ) {
  // update the mouse variable
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ( ( event.clientX - rect.left ) / ( rect.right - rect.left ) ) * 2 - 1;
  pointer.y = - ( ( event.clientY - rect.top ) / ( rect.bottom - rect.top) ) * 2 + 1;
  raycaster.setFromCamera( pointer, camera );
  const id_city_clicked = findIdCityClicked(raycaster);
  if (id_city_clicked == null) { return; }

  var obj_clicked = v_city_puck_inner[id_city_clicked];

  // First city gets raised
  if (vStartEndCity.length == 0) {
    adjustRaise(obj_clicked);
    obj_clicked.material.color.set(rgb_path);
  
  // City in the list gets lowered
  } else if (vStartEndCity.length == 1) {
    const id_lower = vStartEndCity[0];
    const object_lower = scene.getObjectById(id_lower);
    adjustLower(object_lower);
    object_lower.material.color.set(rgb_puck_inner);
  }

  const id_raise = obj_clicked.id;
  manageStartEndCity(id_raise);
  
  drawPath();
}

function drawPath() {
  if (vStartEndCity.length != 2) { return; }

  var v_id_path = loadPathReal(helper_cpp, 
    dictObIdToCityId[vStartEndCity[0]],
    dictObIdToCityId[vStartEndCity[1]],
  );

  // Log to console
  console.log("Printing v_id_path" + v_id_path);
  
  // Gets the xyz positions of the cities in v_id_path
  const points = [];
  for (let i = 0; i < v_id_path.length; i++) {
    var id = v_id_path[i];
    var pos = vCity[id].getPosition();
    points.push(pos);
  }

  const n_cyl_required = points.length - 1;

  // Add cylinders if the number of points is greater than the number of cylinders
  for (let i = v_cylinders.length; i < n_cyl_required; i++) {
    const cylinder = createNewCylinder(path_rad);
    cylinder.material.color.set(rgb_path);
    v_cylinders.push(cylinder);
  }

  // Move the remaining cylinders off the screen
  for (let i = n_cyl_required; i < v_cylinders.length; i++) {
    const cylinder = v_cylinders[i];
    cylinder.position.set(0, 0, -1000);
  }
  
  // Adds a cylinder between each pair of points
  for (let i = 1; i < points.length; i++) {
    const cylinder = v_cylinders[i - 1];
    const xyz_0 = points[i - 1];
    const xyz_1 = points[i];
    adjustCylinder(cylinder, xyz_0, xyz_1);
  }
}

function manageStartEndCity(id) {
  if (vStartEndCity.length <= 1) {
    vStartEndCity.push(id);
    return -1;
  } else {
    // remove the first city from the list 
    const id_remove = vStartEndCity.shift();
    vStartEndCity.push(id);
    return id_remove;
  }
}


function onWindowResize() {
  console.log("CW" + canvas_holder.clientWidth + " CH" + canvas_holder.clientHeight);
  canvas_sizer.set_size();
}

function animate() {
  requestAnimationFrame(animate);
  render();
}

function render() {
  camera.position.set(-168, -1000, 800)
  camera.lookAt( 0, 0, 0 );
  
  // tilt camera counter clockwise, look from above
  camera.rotation.z = THREE.MathUtils.degToRad( -11 );

  camera.updateMatrixWorld();

  renderer.render( scene, camera );
}
