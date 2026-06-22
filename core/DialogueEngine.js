// core/DialogueEngine.js

export class DialogueEngine {
  constructor(dialogueData, patientStateModel = null) {
    this.dialogueData = dialogueData;
    this.patientStateModel = patientStateModel;
    this.conversationLog = [];
    this.lastProactiveTime = 0;
  }

  /**
   * Main method used when the trainee says/types something.
   */
  respondToTrainee(traineeText, currentState = null, context = {}) {
    const state = currentState || this.getCurrentState();

    this.logMessage("trainee", traineeText);

    const response = this.generateResponse(traineeText, state, context);

    this.logMessage("patient", response, {
      stateSnapshot: state,
      context
    });

    return response;
  }

  /**
   * Used when the patient speaks without being asked,
   * for example if the trainee is inactive too long.
   */
  generateProactiveLine(currentState = null, reason = "inactiveTooLong") {
    const state = currentState || this.getCurrentState();
    const stateCategory = this.getStateCategory(state);

    if (this.isCardiacArrestWithNoSpeech(state)) {
      return "";
    }

    if (stateCategory === "unconscious") {
      return "";
    }

    let possibleLines = [];

    if (this.dialogueData.proactiveLines?.[reason]) {
      possibleLines = this.dialogueData.proactiveLines[reason];
    } else if (this.dialogueData.proactiveLines?.shockWorsening) {
      possibleLines = this.dialogueData.proactiveLines.shockWorsening;
    } else if (this.dialogueData.proactiveLines?.inactiveTooLong) {
      possibleLines = this.dialogueData.proactiveLines.inactiveTooLong;
    } else {
      possibleLines = [];
    }

    const line = this.pickRandom(possibleLines);

    if (line) {
      this.logMessage("patient", line, {
        type: "proactive",
        reason,
        stateSnapshot: state
      });
    }

    return line;
  }

  /**
   * Core rule-based response logic.
   */
  generateResponse(traineeText, state, context = {}) {
    const cleanedText = traineeText.toLowerCase().trim();
    const stateCategory = this.getStateCategory(state);

    if (this.isCardiacArrestWithNoSpeech(state)) {
      return "";
    }

    if (stateCategory === "unconscious") {
      return "";
    }

    if (stateCategory === "critical") {
      return this.getCriticalResponse(cleanedText);
    }

    const triggeredResponse = this.getTriggeredResponse(cleanedText, context);

    if (triggeredResponse) {
      return this.adaptResponseToState(triggeredResponse, stateCategory);
    }

    return this.getFallbackResponse(stateCategory);
  }

  /**
   * Looks for obvious intent in trainee speech or recent physical action.
   */
  getTriggeredResponse(cleanedText, context = {}) {
    const triggeredLines = this.dialogueData.triggeredLines || {};

    // Physical interaction context from VR/action system
    if (context.action === "legTouched" && triggeredLines.legTouched) {
      return this.pickRandom(triggeredLines.legTouched);
    }

    if (
      context.action === "splintOrImmobilisationApplied" &&
      triggeredLines.splintOrImmobilisationApplied
    ) {
      return this.pickRandom(triggeredLines.splintOrImmobilisationApplied);
    }

    if (context.action === "reassured" && triggeredLines.reassured) {
      return this.pickRandom(triggeredLines.reassured);
    }

    if (context.action === "oxygenApplied" && triggeredLines.oxygenApplied) {
      return this.pickRandom(triggeredLines.oxygenApplied);
    }

    if (context.action === "imAdrenalineGiven" && triggeredLines.imAdrenalineGiven) {
      return this.pickRandom(triggeredLines.imAdrenalineGiven);
    }

    if (context.action === "afterAdrenalineReassess" && triggeredLines.afterAdrenalineReassess) {
      return this.pickRandom(triggeredLines.afterAdrenalineReassess);
    }

    if (context.action === "fluidsGiven" && triggeredLines.fluidsGiven) {
      return this.pickRandom(triggeredLines.fluidsGiven);
    }

    if (context.action === "antibioticsGiven" && triggeredLines.antibioticsGiven) {
      return this.pickRandom(triggeredLines.antibioticsGiven);
    }

    if (context.action === "monitoringAttached" && triggeredLines.monitoringAttached) {
      return this.pickRandom(triggeredLines.monitoringAttached);
    }

    // Speech intent checks
    if (
      this.includesAny(cleanedText, ["where", "hurt", "pain", "sore"]) &&
      triggeredLines.askedPainLocation
    ) {
      return this.pickRandom(triggeredLines.askedPainLocation);
    }

    if (
      this.includesAny(cleanedText, ["what happened", "how did", "fall", "injury"]) &&
      triggeredLines.askedWhatHappened
    ) {
      return this.pickRandom(triggeredLines.askedWhatHappened);
    }

    if (
      this.includesAny(cleanedText, ["allergy", "allergies", "allergic"]) &&
      triggeredLines.askedAllergies
    ) {
      return this.pickRandom(triggeredLines.askedAllergies);
    }

    if (
      this.includesAny(cleanedText, ["medication", "medications", "medicine", "tablets", "drugs"]) &&
      triggeredLines.askedMedications
    ) {
      return this.pickRandom(triggeredLines.askedMedications);
    }

    if (
      this.includesAny(cleanedText, ["breathe", "breathing", "breath", "airway", "throat"]) &&
      triggeredLines.askedBreathing
    ) {
      return this.pickRandom(triggeredLines.askedBreathing);
    }

    if (
      this.includesAny(cleanedText, ["itch", "itchy", "rash", "skin", "hives"]) &&
      triggeredLines.askedRashOrItching
    ) {
      return this.pickRandom(triggeredLines.askedRashOrItching);
    }

    if (
      this.includesAny(cleanedText, ["name", "called", "who are you"]) &&
      triggeredLines.askedName
    ) {
      return this.pickRandom(triggeredLines.askedName);
    }

    if (
      this.includesAny(cleanedText, ["okay", "safe", "help", "stay with", "ambulance"]) &&
      triggeredLines.reassured
    ) {
      return this.pickRandom(triggeredLines.reassured);
    }

    if (
      this.includesAny(cleanedText, ["urine", "pee", "peed", "toilet", "passing water", "wee"]) &&
      triggeredLines.askedUrine
    ) {
      return this.pickRandom(triggeredLines.askedUrine);
    }

    if (
      this.includesAny(cleanedText, ["temperature", "fever", "hot", "cold", "shiver", "shivering"]) &&
      triggeredLines.askedTemperature
    ) {
      return this.pickRandom(triggeredLines.askedTemperature);
    }

    if (
      this.includesAny(cleanedText, ["confused", "confusion", "know where", "thinking", "understand"]) &&
      triggeredLines.askedConfusion
    ) {
      return this.pickRandom(triggeredLines.askedConfusion);
    }

    return null;
  }

  /**
   * Makes the same answer sound different depending on patient state.
   */
  adaptResponseToState(response, stateCategory) {
    if (!response) return "";

    if (stateCategory === "stable") {
      return response;
    }

    if (stateCategory === "deteriorating") {
      return this.addDeteriorationCue(response);
    }

    if (stateCategory === "critical") {
      return this.shortenForCriticalState(response);
    }

    return response;
  }

  getCriticalResponse(cleanedText) {
    const fallback = this.dialogueData.fallbackResponses || {};

    if (this.includesAny(cleanedText, ["name", "hurt", "pain", "what happened"])) {
      return fallback.tooUnwell || "I... I can't...";
    }

    return fallback.tooUnwell || "I feel... faint...";
  }

  getFallbackResponse(stateCategory) {
    const fallback = this.dialogueData.fallbackResponses || {};

    if (stateCategory === "deteriorating") {
      return fallback.deteriorating || "I feel dizzy... and really cold.";
    }

    if (stateCategory === "critical") {
      return fallback.tooUnwell || "I... I can't...";
    }

    return fallback.unknown || "I don't know...";
  }

  /**
   * Turns numerical patient state into dialogue categories.
   */
  getStateCategory(state = {}) {
    const consciousness = this.getNumericStateValue(state, "consciousness", 1);
    const systolicBP = this.getSystolicBloodPressure(state);

    const spo2 =
      this.getNumericStateValue(state, "spo2", null) ??
      this.getNumericStateValue(state, "oxygenSaturation", 98);

    const pulseRate =
      this.getNumericStateValue(state, "pulseRate", null) ??
      this.getNumericStateValue(state, "heartRate", 80);

    const respiratoryRate =
      this.getNumericStateValue(state, "respiratoryRate", null) ??
      this.getNumericStateValue(state, "respRate", 16);

    if (consciousness <= 0.05) {
      return "unconscious";
    }

    if (
      consciousness <= 0.25 ||
      systolicBP < 80 ||
      spo2 < 85 ||
      pulseRate >= 140 ||
      respiratoryRate >= 34
    ) {
      return "critical";
    }

    if (
      consciousness <= 0.6 ||
      systolicBP < 100 ||
      spo2 < 92 ||
      pulseRate >= 120 ||
      respiratoryRate >= 28
    ) {
      return "deteriorating";
    }

    return "stable";
  }

  /**
   * Supports states written either as:
   * { consciousness: 0.8 }
   * or:
   * { consciousness: { current: 0.8 } }
   */
  getNumericStateValue(state, key, defaultValue) {
    const value = state[key];

    if (typeof value === "number") {
      return value;
    }

    if (value && typeof value.current === "number") {
      return value.current;
    }

    return defaultValue;
  }

  /**
   * Supports BP written as:
   * { bloodPressure: "90/60" }
   * { bloodPressure: { systolic: 90, diastolic: 60 } }
   * { systolicBP: 90 }
   */
  getSystolicBloodPressure(state = {}) {

    if (typeof state.bloodPressureSystolic === "number") {
      return state.bloodPressureSystolic;
    }

    if (typeof state.systolicBP === "number") {
      return state.systolicBP;
    }

    if (typeof state.bloodPressure === "string") {
      const systolic = Number(state.bloodPressure.split("/")[0]);
      return Number.isFinite(systolic) ? systolic : 120;
    }

    if (
      state.bloodPressure &&
      typeof state.bloodPressure.systolic === "number"
    ) {
      return state.bloodPressure.systolic;
    }

    if (
      state.bloodPressure &&
      typeof state.bloodPressure.current === "string"
    ) {
      const systolic = Number(state.bloodPressure.current.split("/")[0]);
      return Number.isFinite(systolic) ? systolic : 120;
    }

    return 120;
  }

  isCardiacArrestWithNoSpeech(state = {}) {
    const scenarioId = this.dialogueData?.scenarioId;
    const rhythmState = state.rhythmState;
    const consciousness = this.getNumericStateValue(state, "consciousness", 1);
    const pulseRate = this.getNumericStateValue(state, "pulseRate", 60);
    const respiratoryRate = this.getNumericStateValue(state, "respiratoryRate", 12);

    const isCardiacArrestScenario = scenarioId === "cardiac-arrest-adult";
    const isInArrest = rhythmState === "arrest" || rhythmState === "rosc_pending";
    const isUnresponsive =
      consciousness <= 0.05 ||
      pulseRate <= 0 ||
      respiratoryRate <= 0;

    return isCardiacArrestScenario && isInArrest && isUnresponsive;
  }

  getCurrentState() {
    if (!this.patientStateModel) {
      return {};
    }

    const model = this.patientStateModel;

    // Preferred method if your model provides it
    if (typeof model.getCurrentState === "function") {
      return model.getCurrentState();
    }

    // Fallback for your current PatientStateModel structure
    const state = {
      rhythmState: model.rhythmState,
      arrestRhythm: model.arrestRhythm
    };

    if (model.parameters) {
      for (const [key, parameter] of Object.entries(model.parameters)) {
        if (parameter && typeof parameter === "object" && "value" in parameter) {
          state[key] = parameter.value;
        }
      }
    }

    if (model.simulationState) {
      Object.assign(state, model.simulationState);
    }

    return state;
  }

  logMessage(speaker, text, metadata = {}) {
    this.conversationLog.push({
      timestamp: Date.now(),
      speaker,
      text,
      ...metadata
    });
  }

  getConversationLog() {
    return this.conversationLog;
  }

  clearConversationLog() {
    this.conversationLog = [];
  }

  includesAny(text, terms) {
    return terms.some((term) => text.includes(term));
  }

  pickRandom(lines = []) {
    if (!Array.isArray(lines) || lines.length === 0) {
      return "";
    }

    const index = Math.floor(Math.random() * lines.length);
    return lines[index];
  }

  addDeteriorationCue(response) {
  if (!response) return "";

  // Do not add a deterioration cue if the response already sounds symptomatic.
  const alreadyHasSymptom = this.includesAny(response.toLowerCase(), [
      "dizzy",
      "faint",
      "cold",
      "breath",
      "breathe",
      "throat",
      "tight",
      "weak",
      "scared",
      "confused",
      "pain",
      "hurts",
      "agony",
      "itch",
      "rash",
      "funny"
    ]);

    if (alreadyHasSymptom) {
      return response;
    }

    const cue = this.getScenarioDeteriorationCue();

    if (!cue) {
      return response;
    }

    return `${response} ${cue}`;
  }

  getScenarioDeteriorationCue() {
    const scenarioId = this.dialogueData?.scenarioId || this.dialogueData?.id || "";

    const cuesByScenario = {
      "fractured-femur-adult": [
        "I feel cold...",
        "I feel a bit faint...",
        "I feel like I might pass out...",
        "Please don't move my leg..."
      ],

      "anaphylaxis-paediatric": [
        "My throat feels tight...",
        "It's hard to breathe...",
        "I feel scared...",
        "My mouth feels funny..."
      ],

      "sepsis-adult": [
        "I feel really cold...",
        "I feel weak...",
        "I don't feel right...",
        "I'm finding it hard to think..."
      ],

      "cardiac-arrest-adult": [
        "I feel very weak...",
        "I don't understand...",
        "I feel strange..."
      ]
    };

    const possibleCues = cuesByScenario[scenarioId] || [
      "I don't feel right..."
    ];

    return this.pickRandom(possibleCues);
  }

  shortenForCriticalState(response) {
    const words = response.split(" ").slice(0, 5).join(" ");
    return `${words}...`;
  }
}