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

// Fonts, sounds and options of the app (the ids are what the app's web address expects)
const FONTS = [
	{ id: 'default', label: 'System default' }, { id: 'inter', label: 'Inter' }, { id: 'oswald', label: 'Oswald' },
	{ id: 'barlow', label: 'Barlow Condensed' }, { id: 'bebas', label: 'Bebas Neue' }, { id: 'orbitron', label: 'Orbitron' },
	{ id: 'sharetech', label: 'Share Tech Mono' }, { id: 'jetbrains', label: 'JetBrains Mono' },
	{ id: 'robotomono', label: 'Roboto Mono' }, { id: 'spacemono', label: 'Space Mono' },
]
const SOUNDS = [
	{ id: 'beep', label: 'Beep' }, { id: 'chime', label: 'Chime' }, { id: 'bell', label: 'Bell' }, { id: 'alarm', label: 'Alarm' },
]
const ON_OFF_TOGGLE = [
	{ id: 'on', label: 'On' }, { id: 'off', label: 'Off' }, { id: 'toggle', label: 'Toggle' },
]
const hex6 = (n) => '#' + (Number(n) & 0xffffff).toString(16).padStart(6, '0')
const clockText = (ms) => {
	const s = Math.max(0, Math.round((ms || 0) / 1000))
	const h = Math.floor(s / 3600)
	const mi = Math.floor((s % 3600) / 60)
	const se = s % 60
	const two = (x) => String(x).padStart(2, '0')
	return h ? `${h}:${two(mi)}:${two(se)}` : `${two(mi)}:${two(se)}`
}

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
	duration: '--:--',
	overtime: '',
	ends_at_display: '',
	countdown_bar: '',
	muted: '',
	volume: '',
	sound: '',
	repeats: '',
	segment_number: '',
	segment_count: '',
	segment_name: '',
	segment_next: '',
	segment_auto: '',
	segment_text: '',
	font: '',
	weight: '',
	background: '',
	opacity: '',
	text_color: '',
	text_shadow: '',
	display_on_top: '',
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
			duration: { name: 'Duration the timer resets to (mm:ss or h:mm:ss)' },
			overtime: { name: 'Count up after zero on the display (on or off)' },
			ends_at_display: { name: 'Ends-at line on the display (on or off)' },
			countdown_bar: { name: 'Countdown bar on the display (on or off)' },
			muted: { name: 'Sound muted (on or off)' },
			volume: { name: 'Sound volume (0 to 100)' },
			sound: { name: 'Sound (beep, chime, bell or alarm)' },
			repeats: { name: 'Sound repeats (1 to 10)' },
			segment_number: { name: 'Run of show: current segment number (0 before the first)' },
			segment_count: { name: 'Run of show: number of segments' },
			segment_name: { name: 'Run of show: current segment name' },
			segment_next: { name: 'Run of show: next segment name' },
			segment_auto: { name: 'Run of show: start the next segment automatically (on or off)' },
			segment_text: { name: 'Run of show: like "2 of 4" (empty without a run of show)' },
			font: { name: 'Timer display font' },
			weight: { name: 'Timer display font weight (light, regular or bold)' },
			background: { name: 'Timer display background color (hex, or theme)' },
			opacity: { name: 'Timer display background opacity (0 = see-through, 100 = solid)' },
			text_color: { name: 'Timer display text color (auto, light or dark)' },
			text_shadow: { name: 'Timer display text shadow (on or off)' },
			display_on_top: { name: 'Timer display stays above other windows (on or off)' },
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
		const sig = s
			? [
					s.state, s.timeTravel, s.mode, s.color, s.display, s.face, s.overtime, s.endsAtOnDisplay, s.countdownBar, s.displayTop,
					s.audio && s.audio.muted, s.show && s.show.auto, s.show && s.show.index, s.look && s.look.alpha,
				].join('|')
			: 'offline'
		if (!force && sig === this.sig) return
		this.sig = sig
		this.checkFeedbacks(
			'connected', 'state_is', 'travel_on', 'mode_is', 'timer_color', 'display_shown', 'face_is',
			'overtime_on', 'ends_at_display_on', 'countdown_bar_on', 'muted_on', 'segment_auto_on', 'segment_is', 'display_top_on', 'see_through_on',
		)
	}

	publish(b) {
		// Older versions of the app do not report everything below, so these may be missing
		const a = (b && b.audio) || {}
		const sh = (b && b.show) || {}
		const lk = (b && b.look) || {}
		const onOff = (v) => (v === undefined || v === null ? '' : v ? 'on' : 'off')
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
					duration: clockText(b.baseMs != null ? b.baseMs : b.totalMs),
					overtime: onOff(b.overtime),
					ends_at_display: onOff(b.endsAtOnDisplay),
					countdown_bar: onOff(b.countdownBar),
					muted: onOff(a.muted),
					volume: a.volume != null ? a.volume : '',
					sound: a.sound || '',
					repeats: a.repeats != null ? a.repeats : '',
					segment_number: sh.index != null ? sh.index : '',
					segment_count: sh.count != null ? sh.count : '',
					segment_name: sh.name || '',
					segment_next: sh.next || '',
					segment_auto: onOff(sh.auto),
					segment_text: sh.count && sh.index ? `${sh.index} of ${sh.count}` : '',
					font: lk.font || '',
					weight: lk.weight || '',
					background: lk.bg === undefined ? '' : lk.bg || 'theme',
					opacity: lk.alpha != null ? lk.alpha : '',
					text_color: lk.text || '',
					text_shadow: onOff(lk.shadow),
					display_on_top: onOff(b.displayTop),
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
			adjust: {
				name: 'Add or take away time',
				description: 'Works while the timer is idle, running or paused. While idle it changes the duration. Reset still goes back to the original duration.',
				options: [
					choice('dir', 'Direction', 'add', [
						{ id: 'add', label: 'Add time' },
						{ id: 'remove', label: 'Take away time' },
					]),
					number('minutes', 'Minutes', 1, 0, 60),
					number('seconds', 'Seconds', 0, 0, 59),
				],
				callback: async ({ options }) => {
					const secs = (Number(options.minutes) || 0) * 60 + (Number(options.seconds) || 0)
					if (!secs) return
					await this.command(`/adjust?seconds=${options.dir === 'remove' ? -secs : secs}`)
				},
			},
			until: {
				name: 'Count down to a time of day',
				description: 'Starts the timer counting down to the next time the clock reads this, for example 14:45 or 2:45pm',
				options: [
					{ type: 'textinput', id: 'time', label: 'Time of day', default: '12:00', useVariables: true },
					{ type: 'checkbox', id: 'resetFirst', label: 'Reset the timer first', default: true },
				],
				callback: async ({ options }) => {
					if (options.resetFirst) await this.command('/reset')
					await this.command(`/until?time=${encodeURIComponent(String(options.time).trim())}`)
				},
			},
			audio_mute: {
				name: 'Sound mute',
				options: [
					choice('mode', 'Sound', 'toggle', [
						{ id: 'mute', label: 'Mute' },
						{ id: 'unmute', label: 'Unmute' },
						{ id: 'toggle', label: 'Toggle' },
					]),
				],
				callback: async ({ options }) => {
					await this.command(`/audio/${options.mode}`)
				},
			},
			audio_volume: {
				name: 'Sound volume',
				options: [
					choice('mode', 'Do this', 'set', [
						{ id: 'set', label: 'Set the volume to' },
						{ id: 'change', label: 'Change the volume by' },
					]),
					number('value', 'Volume (0 to 100), or change (-100 to 100)', 80, -100, 100),
				],
				callback: async ({ options }) => {
					const current = this.state && this.state.audio ? Number(this.state.audio.volume) : 80
					const next = options.mode === 'change' ? current + Number(options.value) : Number(options.value)
					await this.command(`/audio/volume?value=${Math.min(100, Math.max(0, Math.round(next)))}`)
				},
			},
			audio_sound: {
				name: 'Sound choice',
				options: [choice('name', 'Sound', 'beep', SOUNDS)],
				callback: async ({ options }) => {
					await this.command(`/audio/sound?name=${options.name}`)
				},
			},
			audio_repeats: {
				name: 'Sound repeats',
				options: [number('value', 'Times the sound plays', 3, 1, 10)],
				callback: async ({ options }) => {
					await this.command(`/audio/repeats?value=${Math.round(Number(options.value))}`)
				},
			},
			audio_test: {
				name: 'Play the end sound (test)',
				options: [],
				callback: async () => {
					await this.command('/audio/test')
				},
			},
			overtime: {
				name: 'Count up after zero on the display',
				options: [choice('mode', 'Count up', 'toggle', ON_OFF_TOGGLE)],
				callback: async ({ options }) => {
					await this.command(`/overtime/${options.mode}`)
				},
			},
			countdown_bar: {
				name: 'Countdown bar on the display',
				description: 'The bar that shrinks under the countdown',
				options: [choice('mode', 'Countdown bar', 'toggle', ON_OFF_TOGGLE)],
				callback: async ({ options }) => {
					await this.command(`/bar/${options.mode}`)
				},
			},
			ends_at_display: {
				name: 'Ends-at line on the display',
				description: 'The small "ends at 2:45 PM" line under the countdown',
				options: [choice('mode', 'Ends-at line', 'toggle', ON_OFF_TOGGLE)],
				callback: async ({ options }) => {
					await this.command(`/endshow/${options.mode}`)
				},
			},
			display_top: {
				name: 'Timer display stays on top',
				description: 'Keeps the Timer display window above other windows',
				options: [choice('mode', 'On top', 'toggle', ON_OFF_TOGGLE)],
				callback: async ({ options }) => {
					await this.command(`/displaytop/${options.mode}`)
				},
			},
			show_next: {
				name: 'Run of show: next segment',
				options: [],
				callback: async () => {
					await this.command('/show/next')
				},
			},
			show_prev: {
				name: 'Run of show: previous segment',
				options: [],
				callback: async () => {
					await this.command('/show/prev')
				},
			},
			show_go: {
				name: 'Run of show: go to segment',
				description: 'Segment numbers start at 1',
				options: [number('segment', 'Segment number', 1, 1, 99)],
				callback: async ({ options }) => {
					await this.command(`/show/go?segment=${Math.round(Number(options.segment))}`)
				},
			},
			show_auto: {
				name: 'Run of show: start the next segment automatically',
				options: [choice('mode', 'Automatic', 'toggle', ON_OFF_TOGGLE)],
				callback: async ({ options }) => {
					await this.command(`/show/auto/${options.mode}`)
				},
			},
			look: {
				name: 'Timer display look',
				description: 'Changes how the Timer display window looks. Leave a setting on "No change" to keep it as it is.',
				options: [
					choice('font', 'Font', 'keep', [{ id: 'keep', label: 'No change' }, ...FONTS]),
					choice('weight', 'Weight', 'keep', [
						{ id: 'keep', label: 'No change' },
						{ id: 'light', label: 'Light' },
						{ id: 'regular', label: 'Regular' },
						{ id: 'bold', label: 'Bold' },
					]),
					choice('bg', 'Background', 'keep', [
						{ id: 'keep', label: 'No change' },
						{ id: 'theme', label: 'Normal dark or light background' },
						{ id: 'color', label: 'The color below' },
					]),
					{ type: 'colorpicker', id: 'color', label: 'Background color (used when "The color below" is chosen)', default: 0x336699 },
					{ type: 'checkbox', id: 'setOpacity', label: 'Change the opacity', default: false },
					number('opacity', 'Opacity (0 = see-through, 100 = solid)', 100, 0, 100),
					choice('text', 'Text color', 'keep', [
						{ id: 'keep', label: 'No change' },
						{ id: 'auto', label: 'Automatic' },
						{ id: 'light', label: 'Light' },
						{ id: 'dark', label: 'Dark' },
					]),
					choice('shadow', 'Text shadow', 'keep', [
						{ id: 'keep', label: 'No change' },
						{ id: 'on', label: 'On' },
						{ id: 'off', label: 'Off' },
					]),
				],
				callback: async ({ options }) => {
					const q = new URLSearchParams()
					if (options.font !== 'keep') q.set('font', options.font)
					if (options.weight !== 'keep') q.set('weight', options.weight)
					if (options.bg === 'theme') q.set('bg', 'theme')
					if (options.bg === 'color') q.set('bg', hex6(options.color).slice(1))
					if (options.setOpacity) q.set('opacity', String(Math.round(Number(options.opacity))))
					if (options.text !== 'keep') q.set('text', options.text)
					if (options.shadow !== 'keep') q.set('shadow', options.shadow)
					if (![...q.keys()].length) {
						this.log('warn', 'Timer display look: nothing to change. Pick at least one setting.')
						return
					}
					await this.command(`/look?${q}`)
				},
			},
			look_opacity_change: {
				name: 'Timer display opacity: change by',
				description: 'Makes the display background more see-through (negative) or more solid (positive)',
				options: [number('delta', 'Change (-100 to 100)', 10, -100, 100)],
				callback: async ({ options }) => {
					const current = this.state && this.state.look ? Number(this.state.look.alpha) : 100
					await this.command(`/look?opacity=${Math.min(100, Math.max(0, Math.round(current + Number(options.delta))))}`)
				},
			},
			look_reset: {
				name: 'Timer display look: back to normal',
				description: 'System font, light weight, normal background, solid, automatic text color, no shadow',
				options: [],
				callback: async () => {
					await this.command('/look/reset')
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
			overtime_on: {
				type: 'boolean',
				name: 'Count up after zero is on',
				defaultStyle: { bgcolor: BLUE, color: WHITE },
				options: [],
				callback: () => !!this.state && this.state.overtime === true,
			},
			countdown_bar_on: {
				type: 'boolean',
				name: 'Countdown bar on the display is on',
				defaultStyle: { bgcolor: BLUE, color: WHITE },
				options: [],
				callback: () => !!this.state && this.state.countdownBar === true,
			},
			ends_at_display_on: {
				type: 'boolean',
				name: 'Ends-at line on the display is on',
				defaultStyle: { bgcolor: BLUE, color: WHITE },
				options: [],
				callback: () => !!this.state && this.state.endsAtOnDisplay === true,
			},
			muted_on: {
				type: 'boolean',
				name: 'Sound is muted',
				defaultStyle: { bgcolor: ORANGE, color: WHITE },
				options: [],
				callback: () => !!this.state && !!this.state.audio && this.state.audio.muted === true,
			},
			segment_auto_on: {
				type: 'boolean',
				name: 'Run of show: automatic next segment is on',
				defaultStyle: { bgcolor: BLUE, color: WHITE },
				options: [],
				callback: () => !!this.state && !!this.state.show && this.state.show.auto === true,
			},
			segment_is: {
				type: 'boolean',
				name: 'Run of show: current segment is',
				defaultStyle: { bgcolor: GREEN, color: WHITE },
				options: [{ type: 'number', id: 'segment', label: 'Segment number', default: 1, min: 1, max: 99, clampValues: true }],
				callback: ({ options }) => !!this.state && !!this.state.show && this.state.show.index === Number(options.segment),
			},
			display_top_on: {
				type: 'boolean',
				name: 'Timer display stays on top is on',
				defaultStyle: { bgcolor: BLUE, color: WHITE },
				options: [],
				callback: () => !!this.state && this.state.displayTop === true,
			},
			see_through_on: {
				type: 'boolean',
				name: 'Timer display background is see-through (opacity below 100)',
				defaultStyle: { bgcolor: BLUE, color: WHITE },
				options: [],
				callback: () => !!this.state && !!this.state.look && Number(this.state.look.alpha) < 100,
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


			// Adjust time
			const adjust = [
				add('adjust_minus1', 'Take away 1 minute', '-1\\nMIN', BLUE, [{ actionId: 'adjust', options: { dir: 'remove', minutes: 1, seconds: 0 } }]),
				add('adjust_plus1', 'Add 1 minute', '+1\\nMIN', BLUE, [{ actionId: 'adjust', options: { dir: 'add', minutes: 1, seconds: 0 } }]),
				add('adjust_minus5', 'Take away 5 minutes', '-5\\nMIN', BLUE, [{ actionId: 'adjust', options: { dir: 'remove', minutes: 5, seconds: 0 } }]),
				add('adjust_plus5', 'Add 5 minutes', '+5\\nMIN', BLUE, [{ actionId: 'adjust', options: { dir: 'add', minutes: 5, seconds: 0 } }]),
				add('adjust_plus30s', 'Add 30 seconds', '+30\\nSEC', BLUE, [{ actionId: 'adjust', options: { dir: 'add', minutes: 0, seconds: 30 } }]),
				add('duration_readout', 'Duration the timer resets to', `RESETS TO\\n${v('duration')}`, GREY, []),
				add('until_noon', 'Count down to 12:00', 'COUNT TO\\n12:00', BLUE, [{ actionId: 'until', options: { time: '12:00', resetFirst: true } }]),
			]

			// Run of show
			const showPresets = [
				add('show_readout', 'Current segment', `${v('segment_text')}\\n${v('segment_name')}`, GREY, [], [{ feedbackId: 'timer_color', options: { apply: 'text' } }]),
				add('show_next', 'Next segment', 'NEXT\\nSEGMENT', GREEN, [{ actionId: 'show_next', options: {} }]),
				add('show_prev', 'Previous segment', 'PREVIOUS\\nSEGMENT', GREY, [{ actionId: 'show_prev', options: {} }]),
				add('show_next_name', 'Name of the next segment', `UP NEXT\\n${v('segment_next')}`, GREY, []),
				add(
					'show_auto',
					'Start the next segment automatically',
					`AUTO\\nNEXT\\n${v('segment_auto')}`,
					GREY,
					[{ actionId: 'show_auto', options: { mode: 'toggle' } }],
					[{ feedbackId: 'segment_auto_on', options: {}, style: { bgcolor: BLUE, color: WHITE } }],
				),
			]

			// Sound
			const sound = [
				add(
					'sound_mute',
					'Mute / unmute',
					`SOUND\\nMUTE\\n${v('muted')}`,
					GREY,
					[{ actionId: 'audio_mute', options: { mode: 'toggle' } }],
					[{ feedbackId: 'muted_on', options: {}, style: { bgcolor: ORANGE, color: WHITE } }],
				),
				add('sound_volume', 'Volume readout', `VOLUME\\n${v('volume')}`, GREY, []),
				add('sound_up', 'Volume up', 'VOLUME\\n+10', BLUE, [{ actionId: 'audio_volume', options: { mode: 'change', value: 10 } }]),
				add('sound_down', 'Volume down', 'VOLUME\\n-10', BLUE, [{ actionId: 'audio_volume', options: { mode: 'change', value: -10 } }]),
				add('sound_test', 'Play the end sound', 'TEST\\nSOUND', GREY, [{ actionId: 'audio_test', options: {} }]),
				...['beep', 'chime', 'bell', 'alarm'].map((s) =>
					add(`sound_${s}`, `Use the ${s} sound`, s.toUpperCase(), GREY, [{ actionId: 'audio_sound', options: { name: s } }]),
				),
			]

			// What the display shows
			const displayOptions = [
				add(
					'bar_toggle',
					'Countdown bar on the display',
					`COUNTDOWN\\nBAR\\n${v('countdown_bar')}`,
					GREY,
					[{ actionId: 'countdown_bar', options: { mode: 'toggle' } }],
					[{ feedbackId: 'countdown_bar_on', options: {}, style: { bgcolor: BLUE, color: WHITE } }],
				),
				add(
					'ends_at_toggle',
					'Ends-at line on the display',
					`ENDS-AT\\nLINE\\n${v('ends_at_display')}`,
					GREY,
					[{ actionId: 'ends_at_display', options: { mode: 'toggle' } }],
					[{ feedbackId: 'ends_at_display_on', options: {}, style: { bgcolor: BLUE, color: WHITE } }],
				),
				add(
					'overtime_toggle',
					'Count up after zero on the display',
					`COUNT UP\\n${v('overtime')}`,
					GREY,
					[{ actionId: 'overtime', options: { mode: 'toggle' } }],
					[{ feedbackId: 'overtime_on', options: {}, style: { bgcolor: BLUE, color: WHITE } }],
				),
				add(
					'top_toggle',
					'Display stays on top',
					`DISPLAY\\nON TOP\\n${v('display_on_top')}`,
					GREY,
					[{ actionId: 'display_top', options: { mode: 'toggle' } }],
					[{ feedbackId: 'display_top_on', options: {}, style: { bgcolor: BLUE, color: WHITE } }],
				),
			]

			// How the display looks
			const lookNoChange = { font: 'keep', weight: 'keep', bg: 'keep', color: 0x336699, setOpacity: false, opacity: 100, text: 'keep', shadow: 'keep' }
			const look = [
				add('look_clear', 'See-through background', 'SEE\\nTHROUGH', BLUE, [{ actionId: 'look', options: { ...lookNoChange, setOpacity: true, opacity: 0 } }],
					[{ feedbackId: 'see_through_on', options: {}, style: { bgcolor: ORANGE, color: WHITE } }]),
				add('look_solid', 'Solid background', 'SOLID', BLUE, [{ actionId: 'look', options: { ...lookNoChange, setOpacity: true, opacity: 100 } }]),
				add('look_opacity_readout', 'Opacity readout', `OPACITY\\n${v('opacity')}%`, GREY, []),
				add('look_more_clear', 'More see-through', 'OPACITY\\n-10', BLUE, [{ actionId: 'look_opacity_change', options: { delta: -10 } }]),
				add('look_more_solid', 'More solid', 'OPACITY\\n+10', BLUE, [{ actionId: 'look_opacity_change', options: { delta: 10 } }]),
				add('look_shadow', 'Text shadow on', 'SHADOW\\nON', GREY, [{ actionId: 'look', options: { ...lookNoChange, shadow: 'on' } }]),
				add('look_noshadow', 'Text shadow off', 'SHADOW\\nOFF', GREY, [{ actionId: 'look', options: { ...lookNoChange, shadow: 'off' } }]),
				add('look_text_light', 'Light text', 'TEXT\\nLIGHT', GREY, [{ actionId: 'look', options: { ...lookNoChange, text: 'light' } }]),
				add('look_text_dark', 'Dark text', 'TEXT\\nDARK', GREY, [{ actionId: 'look', options: { ...lookNoChange, text: 'dark' } }]),
				add('look_reset', 'Look back to normal', 'LOOK\\nRESET', GREY, [{ actionId: 'look_reset', options: {} }]),
			]
			const fonts = FONTS.map((f) =>
				add(`font_${f.id}`, `Font: ${f.label}`, f.label.toUpperCase().replace(' ', '\\n'), GREY, [{ actionId: 'look', options: { ...lookNoChange, font: f.id } }]),
			)


		const structure = [
			{
				id: 'timer',
				name: 'Clock & Timer',
				definitions: [
					{ id: 'run', type: 'simple', name: 'Run', presets: run },
					{ id: 'durations', type: 'simple', name: 'Durations', presets: durations },
					{ id: 'travel', type: 'simple', name: 'Time travel speed', presets: travel },
					{ id: 'endtime', type: 'simple', name: 'End time', presets: endTime },
					{ id: 'adjust', type: 'simple', name: 'Add or take away time', presets: adjust },
					{ id: 'show', type: 'simple', name: 'Run of show', presets: showPresets },
					{ id: 'sound', type: 'simple', name: 'Sound', presets: sound },
					{ id: 'displayopts', type: 'simple', name: 'Display options', presets: displayOptions },
					{ id: 'look', type: 'simple', name: 'Display look', presets: look },
					{ id: 'fonts', type: 'simple', name: 'Display fonts', presets: fonts },
				],
			},
		]

		return { structure, presets }
	}
}

export const UpgradeScripts = []
