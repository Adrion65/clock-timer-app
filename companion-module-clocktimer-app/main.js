import http from 'node:http'
import { InstanceBase, InstanceStatus } from '@companion-module/base'

// Colours are packed RGB numbers: 0xRRGGBB
const rgb = (r, g, b) => (r << 16) | (g << 8) | b
const WHITE = rgb(255, 255, 255)
const BLACK = rgb(0, 0, 0)
const GREEN = rgb(0, 130, 60)
const BLUE = rgb(0, 80, 150)
const ORANGE = rgb(200, 110, 0)
const GREY = rgb(45, 45, 45)

const hexToNumber = (hex) => parseInt(String(hex).slice(1), 16)
const readableOn = (n) => {
	const r = (n >> 16) & 255
	const g = (n >> 8) & 255
	const b = n & 255
	return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? BLACK : WHITE
}

const DURATIONS = [1, 5, 10, 15, 30, 45, 60, 75, 90, 120]

const OFFLINE = {
	state: 'offline',
	remaining: '--:--',
	remaining_seconds: 0,
	progress_percent: 0,
	time_travel: 'off',
	mode: '',
	speed: 0,
	effective_speed: 0,
	speed_text: '--',
	end_time_setting: '',
	ends_at: '',
	color: '',
	notice: '',
	connected: 'no',
	display: '',
	face: '',
}

export default class ClockTimerInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.config = {}
		this.state = null // last status reported by the app, or null when offline
		this.vars = {} // last variable values we published
		this.sig = '' // what feedbacks depend on, to skip needless rechecks
		this.connected = null // null = unknown, true / false once we know
		this.pollTimer = null
		this.polling = false
	}

	// ---------------------------------------------------------------- lifecycle

	async init(config) {
		this.config = config || {}

		this.setVariableDefinitions({
			state: { name: 'Timer state (idle, running, paused, done, offline)' },
			remaining: { name: 'Time remaining (mm:ss or h:mm:ss)' },
			remaining_seconds: { name: 'Time remaining in seconds' },
			progress_percent: { name: 'Time remaining as a percentage of the duration' },
			time_travel: { name: 'Time travel (on or off)' },
			mode: { name: 'Time travel mode (speed or end)' },
			speed: { name: 'Time travel speed setting' },
			effective_speed: { name: 'Speed the timer is actually running at' },
			speed_text: { name: 'Speed the timer is running at, like 1.25x' },
			end_time_setting: { name: 'End time setting (hh:mm:ss)' },
			ends_at: { name: 'Real clock time the timer will finish' },
			color: { name: 'Current color from the color rules (hex)' },
			notice: { name: 'Warning from the app, such as an impossible end time' },
			connected: { name: 'Connected to the app (yes or no)' },
			display: { name: 'Timer display window (shown, hidden or closed)' },
			face: { name: 'What the Timer display shows (timer or clock)' },
		})

		this.setActionDefinitions(this.buildActions())
		this.setFeedbackDefinitions(this.buildFeedbacks())
		const { structure, presets } = this.buildPresets()
		this.setPresetDefinitions(structure, presets)

		this.publish(null)
		this.updateStatus(InstanceStatus.Connecting)
		this.startPolling()
	}

	async configUpdated(config) {
		this.config = config || {}
		this.connected = null
		this.updateStatus(InstanceStatus.Connecting)
		this.startPolling()
	}

	async destroy() {
		this.stopPolling()
	}

	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Clock & Timer app',
				value:
					'Open the Clock & Timer app first. Its launcher window shows the address it listens on. ' +
					'Leave the defaults below when the app runs on the same computer as Companion.',
			},
			{ type: 'textinput', id: 'host', label: 'App address', width: 8, default: '127.0.0.1' },
			{ type: 'number', id: 'port', label: 'Port', width: 4, min: 1, max: 65535, default: 8787 },
			{
				type: 'number',
				id: 'pollMs',
				label: 'Check the app every (ms)',
				width: 6,
				min: 200,
				max: 5000,
				default: 500,
			},
		]
	}

	// ---------------------------------------------------------------- talking to the app

	get host() {
		return String(this.config.host || '127.0.0.1').trim()
	}
	get port() {
		return Number(this.config.port) || 8787
	}

	request(path) {
		return new Promise((resolve, reject) => {
			const req = http.request(
				{ host: this.host, port: this.port, path, method: 'GET', timeout: 2500, headers: { Accept: 'application/json' } },
				(res) => {
					let data = ''
					res.setEncoding('utf8')
					res.on('data', (chunk) => (data += chunk))
					res.on('end', () => {
						let body = null
						try {
							body = JSON.parse(data)
						} catch (e) {
							// not JSON
						}
						resolve({ status: res.statusCode, body })
					})
				},
			)
			req.on('timeout', () => req.destroy(new Error('Timed out')))
			req.on('error', reject)
			req.end()
		})
	}

	// Send a command. The app answers with its new status, which we show right away.
	async command(path) {
		try {
			const { status, body } = await this.request(path)
			if (body && typeof body === 'object' && body.state) this.applyStatus(body)
			if (status >= 400 || !body || body.ok === false) {
				this.log('warn', (body && body.error) || `The app answered with status ${status}`)
				return false
			}
			if (body.notice) this.log('warn', body.notice)
			return true
		} catch (e) {
			this.log('error', `Could not reach the app: ${e.message}`)
			this.setDisconnected(`Cannot reach ${this.host}:${this.port}`)
			return false
		}
	}

	startPolling() {
		this.stopPolling()
		const every = Math.min(5000, Math.max(200, Number(this.config.pollMs) || 500))
		this.poll()
		this.pollTimer = setInterval(() => this.poll(), every)
	}

	stopPolling() {
		if (this.pollTimer) clearInterval(this.pollTimer)
		this.pollTimer = null
	}

	async poll() {
		if (this.polling) return
		this.polling = true
		try {
			const { status, body } = await this.request('/status')
			if (status === 200 && body && body.state) this.applyStatus(body)
			else this.setDisconnected(`Unexpected answer (${status}). Is this the Clock & Timer app?`)
		} catch (e) {
			this.setDisconnected(`Cannot reach ${this.host}:${this.port}`)
		} finally {
			this.polling = false
		}
	}

	applyStatus(body) {
		this.state = body
		const wasConnected = this.connected
		this.connected = true
		if (wasConnected !== true) this.updateStatus(InstanceStatus.Ok)
		this.publish(body)
		this.recheckFeedbacks(wasConnected !== true)
	}

	setDisconnected(message) {
		const wasConnected = this.connected
		this.state = null
		this.connected = false
		if (wasConnected !== false) this.updateStatus(InstanceStatus.ConnectionFailure, message)
		this.publish(null)
		this.recheckFeedbacks(wasConnected !== false)
	}

	recheckFeedbacks(force) {
		const s = this.state
		const sig = s ? [s.state, s.timeTravel, s.mode, s.color, s.display, s.face].join('|') : 'offline'
		if (!force && sig === this.sig) return
		this.sig = sig
		this.checkFeedbacks('connected', 'state_is', 'travel_on', 'mode_is', 'timer_color', 'display_shown', 'face_is')
	}

	publish(b) {
		const next = b
			? {
					state: b.state,
					remaining: b.remaining,
					remaining_seconds: Math.ceil((b.remainingMs || 0) / 1000),
					progress_percent: Math.round((b.progress || 0) * 100),
					time_travel: b.timeTravel ? 'on' : 'off',
					mode: b.mode,
					speed: b.speed,
					effective_speed: b.effectiveSpeed,
					speed_text: `${Number(b.effectiveSpeed).toFixed(2).replace(/0$/, '')}x`,
					end_time_setting: b.endTimeSetting || '',
					ends_at: b.endsAtText || '',
					color: b.color || '',
					notice: b.notice || '',
					connected: 'yes',
					display: b.display || '',
					face: b.face || '',
				}
			: OFFLINE
		const changed = {}
		for (const [key, value] of Object.entries(next)) {
			if (this.vars[key] !== value) {
				changed[key] = value
				this.vars[key] = value
			}
		}
		if (Object.keys(changed).length) this.setVariableValues(changed)
	}

	// ---------------------------------------------------------------- actions

	buildActions() {
		const number = (id, label, def, min, max) => ({ type: 'number', id, label, default: def, min, max, clampValues: true })
		const choice = (id, label, def, choices) => ({
			type: 'dropdown',
			id,
			label,
			default: def,
			choices,
			disableAutoExpression: true,
		})

		return {
			start: {
				name: 'Start / resume',
				options: [],
				callback: async () => {
					await this.command('/start')
				},
			},
			pause: {
				name: 'Pause',
				options: [],
				callback: async () => {
					await this.command('/pause')
				},
			},
			toggle: {
				name: 'Start or pause',
				description: 'Pauses a running timer, and starts or resumes a timer that is not running',
				options: [],
				callback: async () => {
					await this.command('/toggle')
				},
			},
			reset: {
				name: 'Reset',
				options: [],
				callback: async () => {
					await this.command('/reset')
				},
			},
			set_duration: {
				name: 'Set duration',
				description: 'The duration can only change while the timer is not running, so this resets it first by default',
				options: [
					number('hours', 'Hours', 0, 0, 99),
					number('minutes', 'Minutes', 10, 0, 999),
					number('seconds', 'Seconds', 0, 0, 59),
					{ type: 'checkbox', id: 'resetFirst', label: 'Reset the timer first', default: true },
				],
				callback: async ({ options }) => {
					if (options.resetFirst) await this.command('/reset')
					const query = new URLSearchParams({
						hours: String(options.hours || 0),
						minutes: String(options.minutes || 0),
						seconds: String(options.seconds || 0),
					})
					await this.command(`/set?${query}`)
				},
			},
			travel: {
				name: 'Time travel on / off',
				options: [
					choice('mode', 'Time travel', 'toggle', [
						{ id: 'on', label: 'On' },
						{ id: 'off', label: 'Off' },
						{ id: 'toggle', label: 'Toggle' },
					]),
				],
				callback: async ({ options }) => {
					await this.command(`/travel/${options.mode}`)
				},
			},
			speed: {
				name: 'Set time travel speed',
				options: [number('value', 'Speed (x)', 1.5, 0.5, 3)],
				callback: async ({ options }) => {
					await this.command(`/speed?value=${encodeURIComponent(Number(options.value))}`)
				},
			},
			speed_nudge: {
				name: 'Nudge time travel speed',
				description: 'Adds to, or subtracts from, the current speed setting (0.5x to 3x)',
				options: [number('delta', 'Change (x)', 0.05, -3, 3)],
				callback: async ({ options }) => {
					const current = this.state ? Number(this.state.speed) : 1.5
					const next = Math.min(3, Math.max(0.5, Math.round((current + Number(options.delta)) * 100) / 100))
					await this.command(`/speed?value=${next}`)
				},
			},
			mode: {
				name: 'Time travel mode',
				options: [
					choice('mode', 'Mode', 'speed', [
						{ id: 'speed', label: 'Speed' },
						{ id: 'end', label: 'End time' },
					]),
				],
				callback: async ({ options }) => {
					await this.command(`/mode/${options.mode}`)
				},
			},
			end_time: {
				name: 'Set end time',
				description: 'The real clock time the timer should finish at, for example 12:00, 12:00:30, 13:05 or 1:05pm',
				options: [
					{ type: 'textinput', id: 'time', label: 'End time', default: '12:00', useVariables: true },
					{ type: 'checkbox', id: 'switchMode', label: 'Switch to end-time mode', default: true },
					{ type: 'checkbox', id: 'travelOn', label: 'Turn time travel on', default: false },
				],
				callback: async ({ options }) => {
					const ok = await this.command(`/endtime?time=${encodeURIComponent(String(options.time).trim())}`)
					if (!ok) return
					if (options.switchMode) await this.command('/mode/end')
					if (options.travelOn) await this.command('/travel/on')
				},
			},
			display: {
				name: 'Timer display window',
				description: 'Hides or shows the Timer display window without closing it. Showing it when it was closed opens a new one.',
				options: [
					choice('mode', 'Timer display', 'toggle', [
						{ id: 'show', label: 'Show' },
						{ id: 'hide', label: 'Hide' },
						{ id: 'toggle', label: 'Toggle' },
					]),
				],
				callback: async ({ options }) => {
					await this.command(`/display/${options.mode}`)
				},
			},
			face: {
				name: 'Timer display shows timer or clock',
				description: 'Switches the Timer display window between the countdown and the current time of day.',
				options: [
					choice('mode', 'Show', 'toggle', [
						{ id: 'timer', label: 'Timer' },
						{ id: 'clock', label: 'Clock' },
						{ id: 'toggle', label: 'Toggle' },
					]),
				],
				callback: async ({ options }) => {
					await this.command(`/face/${options.mode}`)
				},
			},
			end_time_clear: {
				name: 'Clear end time',
				options: [],
				callback: async () => {
					await this.command('/endtime/clear')
				},
			},
		}
	}

	// ---------------------------------------------------------------- feedbacks

	buildFeedbacks() {
		return {
			connected: {
				type: 'boolean',
				name: 'App connected',
				description: 'True while Companion can reach the app',
				defaultStyle: { bgcolor: GREEN, color: WHITE },
				options: [],
				callback: () => this.connected === true,
			},
			state_is: {
				type: 'boolean',
				name: 'Timer state is',
				defaultStyle: { bgcolor: GREEN, color: WHITE },
				options: [
					{
						type: 'dropdown',
						id: 'state',
						label: 'State',
						default: 'running',
						choices: [
							{ id: 'running', label: 'Running' },
							{ id: 'paused', label: 'Paused' },
							{ id: 'idle', label: 'Idle (ready to start)' },
							{ id: 'done', label: 'Done (time is up)' },
						],
						disableAutoExpression: true,
					},
				],
				callback: ({ options }) => !!this.state && this.state.state === options.state,
			},
			travel_on: {
				type: 'boolean',
				name: 'Time travel is on',
				defaultStyle: { bgcolor: ORANGE, color: WHITE },
				options: [],
				callback: () => !!this.state && !!this.state.timeTravel,
			},
			mode_is: {
				type: 'boolean',
				name: 'Time travel mode is',
				defaultStyle: { bgcolor: BLUE, color: WHITE },
				options: [
					{
						type: 'dropdown',
						id: 'mode',
						label: 'Mode',
						default: 'end',
						choices: [
							{ id: 'speed', label: 'Speed' },
							{ id: 'end', label: 'End time' },
						],
						disableAutoExpression: true,
					},
				],
				callback: ({ options }) => !!this.state && this.state.mode === options.mode,
			},
			display_shown: {
				type: 'boolean',
				name: 'Timer display is showing',
				description: 'True while a Timer display window is on screen',
				defaultStyle: { bgcolor: BLUE, color: WHITE },
				options: [],
				callback: () => !!this.state && this.state.display === 'shown',
			},
			face_is: {
				type: 'boolean',
				name: 'Timer display shows',
				description: 'True while the Timer display is showing the chosen face',
				defaultStyle: { bgcolor: BLUE, color: WHITE },
				options: [
					{
						type: 'dropdown',
						id: 'face',
						label: 'Face',
						default: 'clock',
						choices: [
							{ id: 'timer', label: 'Timer' },
							{ id: 'clock', label: 'Clock' },
						],
						disableAutoExpression: true,
					},
				],
				callback: ({ options }) => !!this.state && this.state.face === options.face,
			},
			timer_color: {
				type: 'advanced',
				name: 'Timer color',
				description: "Uses the color from the app's color rules for the time remaining. Does nothing while no rule applies.",
				options: [
					{
						type: 'dropdown',
						id: 'apply',
						label: 'Apply color to',
						default: 'background',
						choices: [
							{ id: 'background', label: 'Button background' },
							{ id: 'text', label: 'Button text' },
						],
						disableAutoExpression: true,
					},
				],
				callback: ({ options }) => {
					const hex = this.state && this.state.color
					if (!hex) return {}
					const n = hexToNumber(hex)
					return options.apply === 'text' ? { color: n } : { bgcolor: n, color: readableOn(n) }
				},
			},
		}
	}

	// ---------------------------------------------------------------- presets

	buildPresets() {
		const label = this.label || 'clocktimer'
		const v = (name) => `$(${label}:${name})`
		const presets = {}

		const add = (id, name, text, bgcolor, down, feedbacks = []) => {
			presets[id] = {
				type: 'simple',
				name,
				style: { text, size: 'auto', color: WHITE, bgcolor },
				steps: [{ down, up: [] }],
				feedbacks,
				localVariables: [],
			}
			return id
		}
		const colorRule = { feedbackId: 'timer_color', options: { apply: 'background' } }

		// Run
		const run = [
			add(
				'toggle',
				'Start or pause (shows time left)',
				`${v('remaining')}\\n${v('state')}`,
				GREY,
				[{ actionId: 'toggle', options: {} }],
				[{ feedbackId: 'state_is', options: { state: 'running' }, style: { bgcolor: GREEN, color: WHITE } }, colorRule],
			),
			add(
				'face_toggle',
				'Switch display between timer and clock',
				`SHOW\\n${v('face')}`,
				GREY,
				[{ actionId: 'face', options: { mode: 'toggle' } }],
				[{ feedbackId: 'face_is', options: { face: 'clock' }, style: { bgcolor: BLUE, color: WHITE } }],
			),
			add('start', 'Start / resume', 'START', GREEN, [{ actionId: 'start', options: {} }]),
			add('pause', 'Pause', 'PAUSE', ORANGE, [{ actionId: 'pause', options: {} }]),
			add('reset', 'Reset', 'RESET', GREY, [{ actionId: 'reset', options: {} }]),
			add(
				'display_toggle',
				'Show / hide the Timer display',
				`DISPLAY\\n${v('display')}`,
				GREY,
				[{ actionId: 'display', options: { mode: 'toggle' } }],
				[{ feedbackId: 'display_shown', options: {}, style: { bgcolor: BLUE, color: WHITE } }],
			),
		]

		// Durations
		const durations = DURATIONS.map((m) =>
			add(`duration_${m}`, `Set ${m} minutes`, `${m}\\nmin`, BLUE, [
				{ actionId: 'set_duration', options: { hours: 0, minutes: m, seconds: 0, resetFirst: true } },
			]),
		)

		// Time travel
		const travel = [
			add(
				'travel_toggle',
				'Time travel on / off',
				`TIME\\nTRAVEL\\n${v('time_travel')}`,
				GREY,
				[{ actionId: 'travel', options: { mode: 'toggle' } }],
				[{ feedbackId: 'travel_on', options: {}, style: { bgcolor: ORANGE, color: WHITE } }],
			),
			add('speed_display', 'Speed readout', `SPEED\\n${v('speed_text')}`, GREY, []),
			add('speed_up', 'Speed up a little', 'SPEED\\n+0.05', BLUE, [{ actionId: 'speed_nudge', options: { delta: 0.05 } }]),
			add('speed_down', 'Slow down a little', 'SPEED\\n-0.05', BLUE, [{ actionId: 'speed_nudge', options: { delta: -0.05 } }]),
			add('speed_up_big', 'Speed up more', 'SPEED\\n+0.25', BLUE, [{ actionId: 'speed_nudge', options: { delta: 0.25 } }]),
			add('speed_down_big', 'Slow down more', 'SPEED\\n-0.25', BLUE, [{ actionId: 'speed_nudge', options: { delta: -0.25 } }]),
		]

		// End time
		const endTime = [
			add(
				'mode_speed',
				'Use speed mode',
				'MODE\\nSPEED',
				GREY,
				[{ actionId: 'mode', options: { mode: 'speed' } }],
				[{ feedbackId: 'mode_is', options: { mode: 'speed' }, style: { bgcolor: BLUE, color: WHITE } }],
			),
			add(
				'mode_end',
				'Use end-time mode',
				'MODE\\nEND TIME',
				GREY,
				[{ actionId: 'mode', options: { mode: 'end' } }],
				[{ feedbackId: 'mode_is', options: { mode: 'end' }, style: { bgcolor: BLUE, color: WHITE } }],
			),
			add('end_noon', 'End at 12:00', 'END AT\\n12:00', BLUE, [
				{ actionId: 'end_time', options: { time: '12:00', switchMode: true, travelOn: false } },
			]),
			add('end_clear', 'Clear end time', 'CLEAR\\nEND TIME', GREY, [{ actionId: 'end_time_clear', options: {} }]),
			add('ends_at', 'Real time it will finish', `ENDS AT\\n${v('ends_at')}`, GREY, []),
		]

		const structure = [
			{
				id: 'timer',
				name: 'Clock & Timer',
				definitions: [
					{ id: 'run', type: 'simple', name: 'Run', presets: run },
					{ id: 'durations', type: 'simple', name: 'Durations', presets: durations },
					{ id: 'travel', type: 'simple', name: 'Time travel speed', presets: travel },
					{ id: 'endtime', type: 'simple', name: 'End time', presets: endTime },
				],
			},
		]

		return { structure, presets }
	}
}

export const UpgradeScripts = []
