import type {
  AnimationAction,
  AnimationClip,
  Camera,
  Group,
  Object3DEventMap,
} from "three";
import {
  AmbientLight,
  AnimationMixer,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  LoadingManager,
  LoopOnce,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Quaternion,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { getProject } from "@theatre/core";
import studio from "@theatre/studio";

if (import.meta.env.DEV) {
	studio.initialize();
	const project = getProject("THREE.js x Theatre.js");
	// Create a sheet
	const sheet = project.sheet("Animated scene");
}

type STATES = "idle" | "walking" | "run" | "dance" | "jump";
type parent = CharacterFSM | FiniteStateMachine | null;
abstract class AbstractState {
	get Name(): string | undefined {
		return;
	}
	Enter(...params: any): void {}
	Update(...params: any): void {}
	Exit(): void {}
}
class State extends AbstractState {
	protected _parent: parent;
	protected _name: STATES = "idle";
	constructor(parent: parent) {
		super();
		this._parent = parent;
	}
}

type AnimationsRecord = Record<
	string,
	{
		clip: AnimationClip;
		action: AnimationAction;
	}
>;

class ControllerProxy {
	_animations: AnimationsRecord;

	constructor(animations: AnimationsRecord) {
		this._animations = animations;
	}

	get animations() {
		return this._animations;
	}
}
class ControllerInput {
	keys = {
		forward: false,
		backward: false,
		left: false,
		right: false,
		space: false,
		shift: false,
	};

	constructor() {
		this._Init();
	}

	private _Init() {
		document.addEventListener("keydown", (e) => this._onKeyDown(e), false);
		document.addEventListener("keyup", (e) => this._onKeyUp(e), false);
	}
	private _onKeyDown(event: KeyboardEvent) {
		switch (event.key.toLocaleLowerCase()) {
			case "w": // w
				this.keys.forward = true;
				break;
			case "a": // a
				this.keys.left = true;
				break;
			case "s": // s
				this.keys.backward = true;
				break;
			case "d": // d
				this.keys.right = true;
				break;
			case " ": // SPACE BAR
				this.keys.space = true;
				break;
			case "shift": // SHIFT
				this.keys.shift = true;
				break;
		}
	}
	private _onKeyUp(event: KeyboardEvent) {
		switch (event.key.toLocaleLowerCase()) {
			case "w": // w
				this.keys.forward = false;
				break;
			case "a": // a
				this.keys.left = false;
				break;
			case "s": // s
				this.keys.backward = false;
				break;
			case "d": // d
				this.keys.right = false;
				break;
			case " ": // SPACE
				this.keys.space = false;
				break;
			case "shift": // SHIFT
				this.keys.shift = false;
				break;
		}
	}
}

class FiniteStateMachine extends State {
	//@ts-ignore
	private _states: Record<STATES, State> = {};
	currentState: State | null = null;

	constructor() {
		super(null);
	}

	_AddState<T extends State>(status: STATES, stateType: T) {
		this._states[status] = stateType;
	}

	SetState(nameState: STATES) {
		const prevState = this.currentState;

		if (prevState) {
			//the same prev state as the curr
			if (prevState.Name === nameState) {
				return;
			}
			prevState.Exit();
		}

		const currentState = this._states[nameState]; // are different state classes
		//@ts-ignore
		const state: State = new currentState(this);
		// console.log(state)
		this.currentState = state;
		state.Enter(prevState);
	}

	Update(timeElapsed: number, input: ControllerInput) {
		if (this.currentState) {
			this.currentState.Update(timeElapsed, input);
		}
	}
}
class CharacterFSM extends FiniteStateMachine {
	_proxy: ControllerProxy;
	constructor(proxy: ControllerProxy) {
		super();
		this._proxy = proxy;

		//@ts-ignore
		this._AddState("idle", IdleState);
		//@ts-ignore
		this._AddState("walking", WalkState);
		//@ts-ignore
		this._AddState("run", RunState);
		//@ts-ignore
		this._AddState("dance", DanceState);
	}
}

class IdleState extends State {
	constructor(parent: parent) {
		super(parent);
	}
	get Name() {
		return "idle";
	}

	Enter(prevState: State) {
		if (!this._parent) throw new Error(" PARENT NULL");

		const { _proxy } = this._parent as CharacterFSM;
		const idleAction = _proxy._animations["idle"].action;

		if (!prevState) {
      idleAction.play();
			return;
		}
		// if has a previous state we want to make a smooth transition
		const prevAction = _proxy._animations[prevState.Name!].action;
		idleAction.time = 0.0;
		idleAction.enabled = true;
		idleAction.setEffectiveTimeScale(1.0);
		idleAction.setEffectiveWeight(1.0);
		idleAction.crossFadeFrom(prevAction, 0.5, true);
		idleAction.play();
	}
	Update(_: any, input: ControllerInput) {
		if (!this._parent) throw new Error(" PARENT NULL");

		if (input.keys.forward || input.keys.backward) {
			this._parent.SetState("walking");
		} else if (input.keys.space) {
			this._parent.SetState("dance");
		}
	}
	Exit(): void {
		// console.warn("Method not implemented.");
	}
}
class RunState extends State {
	constructor(parent: parent) {
		super(parent);
		this._name = "run";
	}

	get Name(): STATES {
		return this._name;
	}

	Enter(prevState: State) {
		if (!this._parent) throw new Error(" PARENT NULL");

		const prevName = prevState.Name!;
		const { _proxy } = this._parent as CharacterFSM;
		const curAction = _proxy.animations[this.Name].action;

		if (prevState) {
			const prevAction = _proxy.animations[prevName].action;

			curAction.enabled = true;

			if (prevState.Name == "walking") {
				const ratio =
					curAction.getClip().duration / prevAction.getClip().duration;
				curAction.time = prevAction.time * ratio;
				// ✅
			} else {
				curAction.time = 0.0;
				curAction.setEffectiveTimeScale(1.0);
				curAction.setEffectiveWeight(1.0);
			}
			curAction.crossFadeFrom(prevAction, 0.2, true);
			// curAction.clampWhenFinished = true;
			console.count("running...");
			curAction.play();
		} else {
			curAction.play(); // doesnt enter
		}
	}
	// Set State updates to walking or idle
	Update(timeElapsed: number, input: ControllerInput) {
		if (!this._parent) throw new Error("this parent is null");

		if (input.keys.forward || input.keys.backward) {
			if (!input.keys.shift) {
				this._parent.SetState("walking");
			}
			return;
		}

		this._parent.SetState("idle");
	}
	Exit() {
		const { _proxy } = this._parent as CharacterFSM;
		const curAction = _proxy.animations[this.Name].action;
		// curAction.
	}
}
class WalkState extends State {
	constructor(parent: parent) {
		super(parent);
		this._name = "walking";
	}

	get Name() {
		return this._name;
	}
	Enter(prevState: State) {
		if (!this._parent) throw new Error(" PARENT NULL");

		const { _proxy } = this._parent as CharacterFSM;
		const curAction = _proxy._animations["walking"].action;

		if (prevState) {
			const prevAction = _proxy._animations[prevState.Name!].action;

			curAction.enabled = true;

			if (prevState.Name == "run") {
				const ratio =
					curAction.getClip().duration / prevAction.getClip().duration;
				curAction.time = prevAction.time * ratio;
			} else {
				curAction.time = 0.0;
				curAction.setEffectiveTimeScale(1.0);
				curAction.setEffectiveWeight(1.0);
			}

			curAction.crossFadeFrom(prevAction, 0.5, true);
			curAction.play();
		} else {
			curAction.play(); // doesn't enter
		}
	}
	Update(timeElapsed: number, input: ControllerInput) {
		if (!this._parent) throw new Error(" PARENT NULL");

		if (input.keys.forward || input.keys.backward) {
			if (input.keys.shift) {
				this._parent.SetState("run");
			}
			return;
		}

		this._parent.SetState("idle");
	}
	Exit() {
		// console.log('exit !');
		// const proxy = (this._parent as CharacterFSM)._proxy;
		// const curAction = proxy._animations["walking"].action;
		// // current.fadeOut(FADE_DURATION); // off
		// curAction.reset().fadeIn(0.2).play();
	}
}
class DanceState extends State {
	private _FinishedCallback: () => void;

	constructor(parent: parent) {
		super(parent);
		this._name = "dance";
		this._FinishedCallback = () => {
			// bind method
			this._Finished();
		};
	}

	get Name() {
		return this._name;
	}

	Enter(prevState: State) {
		if (!this._parent) throw new Error(" PARENT NULL");

		const { _proxy } = this._parent as CharacterFSM;
		const curAction = _proxy._animations["dance"].action;

		const mixer = curAction.getMixer();
		mixer.addEventListener("finished", this._FinishedCallback);

		if (prevState) {
			const prevAction = _proxy._animations[prevState.Name!].action;

			curAction.reset();
			curAction.setLoop(LoopOnce, 1);
			curAction.clampWhenFinished = true;
			curAction.crossFadeFrom(prevAction, 0.2, true);
			curAction.play();
		} else {
			curAction.play();
		}
	}
	_Finished() {
		this._Cleanup();
		if (!this._parent) throw new Error(" PARENT NULL");

		this._parent.SetState("idle");
	}
	_Cleanup() {
		if (!this._parent) throw new Error(" PARENT NULL");
		const { _proxy } = this._parent as CharacterFSM;
		const action = _proxy._animations["dance"].action;

		// action.getMixer().removeEventListener("finished", this._CleanupCallback);
		action
			.getMixer()
			.removeEventListener("finished", () => console.warn("Cleanup callback!"));
	}
	Exit() {
		this._Cleanup();
	}
	Update(_: any) {}
}

type params = {
	camera: Camera;
	scene: Scene;
};
class BasicCharacterController {
	private _params: params;
	private _decceleration: Vector3;
	private _acceleration: Vector3;
	private _velocity: Vector3;
	private _animations: AnimationsRecord = {};
	private _input: ControllerInput;
	private _stateMachine: CharacterFSM;
	private _target: Group<Object3DEventMap> | undefined;
	private _mixer!: AnimationMixer;
	private _manager?: LoadingManager;

	constructor(params: params) {
		this._params = params;

		this._decceleration = new Vector3(-0.0005, -0.0001, -5.0);
		this._acceleration = new Vector3(1, 0.25, 25.0);
		this._velocity = new Vector3(0, 0, 0);

		this._input = new ControllerInput();
		this._stateMachine = new CharacterFSM(
			new ControllerProxy(this._animations)
		);

		this._LoadModels();
	}

	private _LoadModels() {
		const loader = new FBXLoader();
		loader.setPath("/resources/homer_walk/");
		loader.load("Walking_skin.fbx", (fbx) => {
			// fbx.scale.setScalar(0.1);
			fbx.traverse((c) => {
				c.castShadow = true;
			});

			this._target = fbx;
			this._params.scene.add(this._target);

			this._mixer = new AnimationMixer(this._target);

			this._manager = new LoadingManager();
			this._manager.onLoad = () => {
				this._stateMachine.SetState("idle");
			};

			const _OnLoad = (
				animName: STATES,
				anim: { animations: AnimationClip[] }
			) => {
				const clip = anim.animations[0];
				const action = this._mixer.clipAction(clip);

				this._animations[animName] = {
					clip: clip,
					action: action,
				};
			};

			const loader = new FBXLoader(this._manager);
			loader.setPath("/resources/homer_walk/");

			loader.load("Walking.fbx", (anim) => {
				_OnLoad("walking", anim);
			});
			loader.load("Running.fbx", (anim) => {
				_OnLoad("run", anim);
			});
			loader.load("Happy Idle.fbx", (anim) => {
				_OnLoad("idle", anim);
			});
			loader.load("Thriller Part 2.fbx", (anim) => {
				_OnLoad("dance", anim);
			});
		});
	}

	tick(timeInSeconds: number) {
		if (!this._target) {
			return;
		}

		this._stateMachine.Update(timeInSeconds, this._input);

		const velocity = this._velocity;
		const frameDecceleration = new Vector3(
			velocity.x * this._decceleration.x,
			velocity.y * this._decceleration.y,
			velocity.z * this._decceleration.z
		);
		frameDecceleration.multiplyScalar(timeInSeconds);
		frameDecceleration.z =
			Math.sign(frameDecceleration.z) *
			Math.min(Math.abs(frameDecceleration.z), Math.abs(velocity.z));

		velocity.add(frameDecceleration);

		const controlObject = this._target;
		const _Q = new Quaternion();
		const _A = new Vector3();
		const _R = controlObject.quaternion.clone();

		const acc = this._acceleration.clone();
		if (this._input.keys.shift) {
			acc.multiplyScalar(2.0);
		}
		// TODO
		if (
			this._stateMachine.currentState &&
			this._stateMachine.currentState.Name === "dance"
		) {
			acc.multiplyScalar(0.0);
		}

		if (this._input.keys.forward) {
			velocity.z += acc.z * timeInSeconds;
		}
		if (this._input.keys.backward) {
			velocity.z -= acc.z * timeInSeconds;
		}
		if (this._input.keys.left) {
			_A.set(0, 1, 0);
			_Q.setFromAxisAngle(
				_A,
				4.0 * Math.PI * timeInSeconds * this._acceleration.y
			);
			_R.multiply(_Q);
		}
		if (this._input.keys.right) {
			_A.set(0, 1, 0);
			_Q.setFromAxisAngle(
				_A,
				4.0 * -Math.PI * timeInSeconds * this._acceleration.y
			);
			_R.multiply(_Q);
		}

		controlObject.quaternion.copy(_R);

		const oldPosition = new Vector3();
		oldPosition.copy(controlObject.position);

		const forward = new Vector3(0, 0, 1);
		forward.applyQuaternion(controlObject.quaternion);
		forward.normalize();

		const sideways = new Vector3(1, 0, 0);
		sideways.applyQuaternion(controlObject.quaternion);
		sideways.normalize();

		sideways.multiplyScalar(velocity.x * timeInSeconds);
		forward.multiplyScalar(velocity.z * timeInSeconds);

		controlObject.position.add(forward);
		controlObject.position.add(sideways);

		oldPosition.copy(controlObject.position);

		if (this._mixer) {
			this._mixer.update(timeInSeconds);
		}
	}
}

export class WorldWithCharacter {
	private _threejs!: WebGLRenderer;
	private _camera!: PerspectiveCamera;
	private _scene!: Scene;
	private _mixers!: AnimationMixer[];
	private _previousRAF!: number | null;
	private _controls: any;

	constructor() {
		this._Initialize();
	}

	private _Initialize() {
		this._threejs = new WebGLRenderer({
			antialias: true,
		});
		this._threejs.outputColorSpace = SRGBColorSpace;
		this._threejs.shadowMap.enabled = true;
		this._threejs.shadowMap.type = PCFSoftShadowMap;
		this._threejs.setPixelRatio(window.devicePixelRatio);
		this._threejs.setSize(window.innerWidth, window.innerHeight);

		document.body.appendChild(this._threejs.domElement);

		window.addEventListener(
			"resize",
			() => {
				this._OnWindowResize();
			},
			false
		);

		const fov = 60;
		const aspect = 1920 / 1080;
		const near = 1.0;
		const far = 500.0;
		this._camera = new PerspectiveCamera(fov, aspect, near, far);
		this._camera.position.set(0, 5, 8);
		this._camera.lookAt(0, 0, 0);

		this._scene = new Scene();

		type light = DirectionalLight | AmbientLight;
		let light: light = new DirectionalLight(0xffffff, 1.0);
		light.position.set(-100, 100, 100);
		light.target.position.set(0, 0, 0);
		light.castShadow = true;
		light.shadow.bias = -0.001;
		light.shadow.mapSize.width = 4096;
		light.shadow.mapSize.height = 4096;
		light.shadow.camera.near = 0.1;
		light.shadow.camera.far = 500.0;
		light.shadow.camera.near = 0.5;
		light.shadow.camera.far = 500.0;
		light.shadow.camera.left = 50;
		light.shadow.camera.right = -50;
		light.shadow.camera.top = 50;
		light.shadow.camera.bottom = -50;
		this._scene.add(light);

		light = new AmbientLight(0xffffff, 0.25);
		this._scene.add(light);

		const controls = new OrbitControls(this._camera, this._threejs.domElement);
		// controls.target.set(0, 10, 0);
		controls.update();

		// const loader = new THREE.CubeTextureLoader();
		// const texture = loader.load([
		// 	"/resources/posx.jpg",
		// 	"/resources/negx.jpg",
		// 	"/resources/posy.jpg",
		// 	"/resources/negy.jpg",
		// 	"/resources/posz.jpg",
		// 	"/resources/negz.jpg",
		// ]);
		// texture.encoding = THREE.sRGBEncoding;
		// this._scene.background = texture;
		this._scene.background = new Color("#000000");
		this._scene.fog = new Fog("black", 6, 30);
		this._scene.add(new GridHelper(40, 40, undefined, "green"));

		this._mixers = [];
		this._previousRAF = null;

		this._LoadAnimatedModel();

		this._RAF();
	}

	private _LoadAnimatedModel() {
		const params = {
			camera: this._camera,
			scene: this._scene,
		};
		this._controls = new BasicCharacterController(params);
	}

	private _LoadAnimatedModelAndPlay(
		path: string,
		modelFile: string,
		animFile: string,
		offset: Vector3
	) {
		const loader = new FBXLoader();
		loader.setPath(path);
		loader.load(modelFile, (fbx) => {
			fbx.scale.setScalar(0.1);
			fbx.traverse((c) => {
				c.castShadow = true;
			});
			fbx.position.copy(offset);

			const anim = new FBXLoader();
			anim.setPath(path);
			anim.load(animFile, (anim) => {
				const m = new AnimationMixer(fbx);
				this._mixers.push(m);
				const idle = m.clipAction(anim.animations[0]);
				idle.play();
			});
			this._scene.add(fbx);
		});
	}

	private _LoadModel() {
		const loader = new GLTFLoader();
		loader.load("/resources/thing.glb", (gltf) => {
			gltf.scene.traverse((c) => {
				c.castShadow = true;
			});
			this._scene.add(gltf.scene);
		});
	}

	private _OnWindowResize() {
		this._camera.aspect = window.innerWidth / window.innerHeight;
		this._camera.updateProjectionMatrix();
		this._threejs.setSize(window.innerWidth, window.innerHeight);
	}

	private _RAF() {
		requestAnimationFrame((t) => {
			if (this._previousRAF === null) {
				this._previousRAF = t;
			}

			this._RAF();

			this._threejs.render(this._scene, this._camera);
			this._Tick(t - this._previousRAF);
			this._previousRAF = t;
		});
	}

	private _Tick(timeElapsed: number) {
		const timeElapsedS = timeElapsed * 0.001;
		if (this._mixers) {
			this._mixers.map((m) => m.update(timeElapsedS));
		}

		if (this._controls) {
			this._controls.tick(timeElapsedS);
		}
	}
}
