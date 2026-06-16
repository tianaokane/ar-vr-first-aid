// core/PatientStateModel.js

export class PatientStateModel {

    constructor(scenarioConfig) {
        //scenarioConfig will come from Pillar 7 JSON file

        // defaults to allow for testing without a scenario config

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

        return {
            pulseRate: {
                value: config?.pulseRate?.initial ?? 88,
                min: 0,
                max: 200,
                driftPerSecond: config?.pulseRate?.drift ?? -0.3,
                criticalBelow: 40,
                criticalAbove: 150,
                unit: 'bpm'
            },

            oxygenSaturation: {
                value: config?.oxygenSaturation?.initial ?? 97,
                min: 0,
                max: 100,
                driftPerSecond: config?.oxygenSaturation?.drift ?? -0.2,
                criticalBelow: 85,
                criticalAbove: null,
                unit: '%'
            },

            consciousness: {
                value: config?.consciousness?.initial ?? 1.0,
                min: 0,
                max: 1,
                driftPerSecond: config?.consciousness?.drift ?? -0.01,
                criticalBelow: 0.3,
                criticalAbove: null,
                unit: 'GCS proxy'
            },

            respiratoryRate: {
                value: config?.respiratoryRate?.initial ?? 16,
                min: 0,
                max: 60,
                driftPerSecond: config?.respiratoryRate?.drift ?? -0.1,
                criticalBelow: 8,
                criticalAbove: 40,
                unit: 'breaths/min'
            },

            painScore: {
                value: config?.painScore?.initial ?? 7,
                min: 0,
                max: 10,
                driftPerSecond: config?.painScore?.drift ?? 0.05,
                criticalBelow: null,
                criticalAbove: null,
                unit: '/10'
            },

            bloodPressureSystolic: {
                value: config?.bloodPressureSystolic?.initial ?? 120,
                min: 0,
                max: 220,
                driftPerSecond: config?.bloodPressureSystolic?.drift ?? -0.4,
                criticalBelow: 70,
                criticalAbove: 180,
                unit: 'mmHg'
            },

            temperature: {
                value: config?.temperature?.initial ?? 37.2,
                min: 32,
                max: 42,
                driftPerSecond: config?.temperature?.drift ?? 0.002, // barely moves
                criticalBelow: 35,
                criticalAbove: 39.5,
                unit: '°C',
                displayOnly: true  // no trainee action significantly affects this
            },

            // Skin colour is derived, not independently tracked.
            // Computed from Sp02, bloodPressureSystolic, and temperature.
            // Values: 'normal', 'pale', 'cyanotic', 'flushed', 'mottled'
            skinColour: {
                value: {
                    state: 'normal',
                    assessmentSite: null,
                    visuallyObvious: true
                },
                displayOnly: true,
                derived: true,
                unit: 'descriptor'
            }
        }
    }

    _computeSkinColour(){
        const sp02 = this.parameters.oxygenSaturation.value
        const bloodPressureSystolic = this.parameters.bloodPressureSystolic.value
        const temp = this.parameters.temperature.value
        const consciousness = this.parameters.consciousness.value
        const fitzpatrick = this.scenarioConfig?.patient?.skinTone ?? null

        const state = this._deriveSkinState(sp02, bloodPressureSystolic, temp, consciousness)

        return { 
            state,
            assessmentSite: this._assessmentSite(state, fitzpatrick),
            visuallyObvious: this._isVisuallyObvious(state, fitzpatrick)
        }
    }
    
    _deriveSkinState(sp02, bloodPressureSystolic, temp, consciousness) {
        if (sp02 < 80) return 'cyanotic'
        if (bloodPressureSystolic < 60 && consciousness < 0.3) return 'mottled'
        if (bloodPressureSystolic < 90 || sp02 < 90) return 'pale'
        if (temp > 38.5) return 'flushed'
        return 'normal'
    }

    // Where on the body to assess the skin colour, depending on the derived state and the Fitzpatrick skin tone.
    _assessmentSite(state, fitzpatrick) {
        if (state === 'normal') return null
        
        const darkTone = ['fitzpatrick_4', 'fitzpatrick_5', 'fitzpatrick_6'].includes(fitzpatrick)
        const unknownTone = fitzpatrick === null

        if (unknownTone) {
            // tone-agnostic instructions - good clinical practice regardless of tone. 
            const agnostic = {
                cyanotic: 'Check mucous membranes, conjunctiva, and lips',
                pale: 'Check conjunctiva, palms, and nail beds',
                flushed: 'Check skin temperature by touch and mucous membranes',
                mottled: 'Look for patchy discolouration on limbs and trunk'
            }
            return agnostic[state] ?? null
        }
        
        if (state === 'cyanotic') {
            return darkTone
                ? 'Check mucous membranes - gums and inner lips'
                : 'Visible at lips and fingertips'
        }
        if (state === 'pale') {
            return darkTone
                ? 'Check conjunctiva and palms'
                : 'Visible on face and nail beds'
        }
        if (state === 'flushed') {
            return darkTone
                ? 'Check skin temperature by touch - redness may not be visible'
                : 'Visible redness on face and neck'
        }
        if (state === 'mottled') {
            return darkTone
                ? 'Look for asymmetric skin temperature and capillary refill'
                : 'Visible patchy purple-pale discolouration on limbs'
        }
        return null
    }

    // Is the sign something the trainee can see with the naked eye, or is it subtle and requires assessment?
    _isVisuallyObvious(state, fitzpatrick) {
        if (state === 'normal') return true
        if (fitzpatrick === null) return false // unknown tone - should prompt for assessment
        const darkTone = ['fitzpatrick_4', 'fitzpatrick_5', 'fitzpatrick_6'].includes(fitzpatrick)
        if (darkTone && ['cyanotic', 'pale', 'flushed'].includes(state)) return false
        return true
    }   

}
