// core/PatientStateModel.js

export class PatientStateModel {

    constructor(scenarioConfig) {
        // scenarioConfig will come from Pillar 7 JSON file
        // defaults allow for testing without a scenario config

        this.startTime = Date.now();
        this.isRunning = false
        this.history = []
        this.intervalId = null
        this.scenarioConfig = scenarioConfig ?? {}

        // initialise all physiological parameters
        this.parameters = this._buildParameters(scenarioConfig);
    }

    _buildParameters(config) {
        // underscore prefix indicates private method
        // this method should only be called from inside this class

        // NOTE: these defaults exist for isolated testing only.
        // All production scenarios must supply full vital sign
        // initial values and drift rates via the scenario JSON.
        // See scenarios/cardiac-arrest-adult.json for reference.

       const vitals = config?.vitals ?? {}

        const neutral = {
            pulseRate:             { initial: 72,   drift: 0,     criticalBelow: 40,  criticalAbove: 150,  min: 0,  max: 200 },
            oxygenSaturation:      { initial: 99,   drift: 0,     criticalBelow: 85,  criticalAbove: null, min: 0,  max: 100 },
            consciousness:         { initial: 1.0,  drift: 0,     criticalBelow: 0.3, criticalAbove: null, min: 0,  max: 1   },
            respiratoryRate:       { initial: 14,   drift: 0,     criticalBelow: 8,   criticalAbove: 40,   min: 0,  max: 60  },
            painScore:             { initial: 0,    drift: 0,     criticalBelow: null,criticalAbove: null, min: 0,  max: 10  },
            bloodPressureSystolic: { initial: 120,  drift: 0,     criticalBelow: 70,  criticalAbove: 180,  min: 0,  max: 220 },
            temperature:           { initial: 37.0, drift: 0,     criticalBelow: 35,  criticalAbove: 39.5, min: 32, max: 42  }
        }

        const built = {}

        for (const [key, defaults] of Object.entries(neutral)) {
            const override = vitals[key] ?? {}
            built[key] = {
                value:          override.initial       ?? defaults.initial,
                min:            override.min           ?? defaults.min,
                max:            override.max           ?? defaults.max,
                driftPerSecond: override.drift         ?? defaults.drift,
                criticalBelow:  override.criticalBelow ?? defaults.criticalBelow,
                criticalAbove:  override.criticalAbove ?? defaults.criticalAbove,
                unit:           this._unitFor(key),
                displayOnly:    key === 'temperature'
            }
        }

        // skin colour is derived — computed from other parameters, not drifted directly
        built.skinColour = {
            value: { state: 'normal', assessmentSite: null, visuallyObvious: true },
            displayOnly: true,
            derived: true,
            unit: 'descriptor'
        }

        return built
    }

    // keeps units out of the JSON — they never change per scenario
    _unitFor(key) {
        const units = {
            pulseRate:             'bpm',
            oxygenSaturation:      '%',
            consciousness:         'GCS proxy',
            respiratoryRate:       'breaths/min',
            painScore:             '/10',
            bloodPressureSystolic: 'mmHg',
            temperature:           '°C'
        }
        return units[key] ?? ''
    }

    _computeSkinColour(){
        const spO2 = this.parameters.oxygenSaturation.value
        const bp = this.parameters.bloodPressureSystolic.value
        const temp = this.parameters.temperature.value
        const consciousness = this.parameters.consciousness.value
        const fitzpatrick = this.scenarioConfig?.patient?.skinTone ?? null

        const state = this._deriveSkinState(spO2, bp, temp, consciousness)

        return {
            state,
            assessmentSite:  this._assessmentSite(state, fitzpatrick),
            visuallyObvious: this._isVisuallyObvious(state, fitzpatrick)
        }
    }
    
    _deriveSkinState(spO2, bp, temp, consciousness) {
        if (spO2 < 80) return 'cyanotic'
        if (bp < 60 && consciousness < 0.3) return 'mottled'
        if (bp < 90 || spO2 < 90) return 'pale'
        if (temp > 38.5) return 'flushed'
        return 'normal'
    }

    // Where on the body to assess the skin colour sign,
    // depending on the derived state and the Fitzpatrick skin tone.
    _assessmentSite(state, fitzpatrick) {
        if (state === 'normal') return null

        const darkTone = ['fitzpatrick_4', 'fitzpatrick_5', 'fitzpatrick_6'].includes(fitzpatrick)
        const unknownTone = fitzpatrick === null

        if (unknownTone) {
            // tone-agnostic instructions — good clinical practice regardless of tone
            const agnostic = {
                cyanotic: 'Check mucous membranes, conjunctiva, and lips',
                pale:     'Check conjunctiva, palms, and nail beds',
                flushed:  'Check skin temperature by touch and mucous membranes',
                mottled:  'Look for patchy discolouration on limbs and trunk'
            }
            return agnostic[state] ?? null
        }

        if (state === 'cyanotic') {
            return darkTone
                ? 'Check mucous membranes — gums and inner lips'
                : 'Visible at lips and fingertips'
        }
        if (state === 'pale') {
            return darkTone
                ? 'Check conjunctiva and palms'
                : 'Visible on face and nail beds'
        }
        if (state === 'flushed') {
            return darkTone
                ? 'Check skin temperature by touch — redness may not be visible'
                : 'Visible redness on face and neck'
        }
        if (state === 'mottled') {
            return darkTone
                ? 'Look for asymmetric skin temperature and capillary refill'
                : 'Visible patchy purple-pale discolouration on limbs'
        }
        return null
    }

    // Is the sign visible to the naked eye, or does it require targeted assessment?
    // false means the trainee must know where to look — not that the sign is absent.
    _isVisuallyObvious(state, fitzpatrick) {
        if (state === 'normal') return true
        if (fitzpatrick === null) return false  // unknown tone — always prompt assessment
        const darkTone = ['fitzpatrick_4', 'fitzpatrick_5', 'fitzpatrick_6'].includes(fitzpatrick)
        if (darkTone && ['cyanotic', 'pale', 'flushed'].includes(state)) return false
        return true
    }

    // Starts the simulation, begins updating patient state at regular intervals
    start() {
        if (this.isRunning) return // prevent double starting

        this.isRunning = true
        this.startTime = Date.now()

        this.intervalId = setInterval(() => {
            this._tick()
        }, 1000) // update every second

        console.log('PatientStateModel: simulation started')
    }
    
    // Stops the simulation, called when scenario ends, patient dies or trainee completes the scenario
    stop() {
        if (!this.isRunning) return  // prevent double-stopping

        this.isRunning = false
        clearInterval(this.intervalId)
        this.intervalId = null

        console.log('PatientStateModel: simulation stopped')
    }

    // Runs every second while simulation is active.
    _tick() {
        // Step 1 — compute coupling penalties from scenario rules before updating
        const coupledDrift = this._computeCoupledDrift()

        // Step 2 — apply base drift + coupling to every parameter except derived ones
        for (const [key, param] of Object.entries(this.parameters)) {
            if (param.derived) continue

            const totalDrift = param.driftPerSecond + (coupledDrift[key] ?? 0)
            param.value += totalDrift

            // clamp — value can never leave its min/max range
            param.value = Math.max(param.min, Math.min(param.max, param.value))
        }

        // Step 3 — recompute derived skin colour from updated values
        this.parameters.skinColour.value = this._computeSkinColour()

        // Step 4 — log snapshot to history
        this._logSnapshot()

        // Step 5 — console output so we can see it working
        console.log(`[t=${this._elapsedSeconds()}s]`,
            `pulse=${this.parameters.pulseRate.value.toFixed(1)}`,
            `SpO2=${this.parameters.oxygenSaturation.value.toFixed(1)}`,
            `consciousness=${this.parameters.consciousness.value.toFixed(2)}`,
            `skin=${this.parameters.skinColour.value.state}`
        )
    }

     // Returns additional drift caused by parameter interdependencies.
    // All coupling rules are defined in the scenario JSON — this method
    // has zero hardcoded clinical knowledge. It just evaluates rules.
    _computeCoupledDrift() {
    const couplings = this.scenarioConfig?.couplings ?? []

    const coupled = {}
    for (const key of Object.keys(this.parameters)) {
        coupled[key] = 0
    }

    for (const rule of couplings) {
        // skip rules that have already fired permanently
        if (rule._fired) continue

        const param = this.parameters[rule.if]
        if (!param) continue

        const conditionMet =
            (rule.below !== undefined && param.value < rule.below) ||
            (rule.above !== undefined && param.value > rule.above)

        if (conditionMet) {
            if (rule.once) {
                // permanently bake the effect into base drift rates
                // this makes the change irreversible — intervention cannot undo it
                for (const [target, delta] of Object.entries(rule.effects)) {
                    if (this.parameters[target]) {
                        this.parameters[target].driftPerSecond += delta
                    }
                }
                rule._fired = true  // never evaluate this rule again
                console.log(`[coupling fired permanently] ${rule.reason}`)
            } else {
                // normal repeating coupling — applied every tick
                for (const [target, delta] of Object.entries(rule.effects)) {
                    if (coupled[target] !== undefined) {
                        coupled[target] += delta
                    }
                }
            }
        }
    }

    return coupled
}
    
    // Records a full snapshot of all parameter values with a timestamp.
    // Pillar 8 (debriefing) uses this to draw vital signs graphs.
    _logSnapshot() {
        const snapshot = {
            time: this._elapsedSeconds(),
            values: {}
        }

        for (const [key, param] of Object.entries(this.parameters)) {
            snapshot.values[key] = param.derived
                ? param.value
                : parseFloat(param.value.toFixed(2))
        }

        this.history.push(snapshot)
    }

    _elapsedSeconds() {
        return Math.floor((Date.now() - this.startTime) / 1000)
    }

}
