import { ScenarioLoader } from "./core/ScenarioLoader.js";
import { PatientStateModel } from "./core/PatientStateModel.js";
import { DialogueEngine } from "./core/DialogueEngine.js";

async function testDialogueEngine() {
  const dialogueResponse = await fetch("./dialogue/fractured-femur-adult-dialogue.json");
  const fracturedFemurDialogue = await dialogueResponse.json();

  const dialogueEngine = new DialogueEngine(fracturedFemurDialogue);

  const stableState = {
    consciousness: 0.8,
    spo2: 97,
    bloodPressure: "110/70"
  };

  console.log("Stable patient:");
  console.log(
    dialogueEngine.respondToTrainee(
      "Where does it hurt?",
      stableState
    )
  );

  const deterioratingState = {
    consciousness: 0.45,
    spo2: 94,
    bloodPressure: "85/55"
  };

  console.log("Deteriorating patient:");
  console.log(
    dialogueEngine.respondToTrainee(
      "Where does it hurt?",
      deterioratingState
    )
  );

  const unconsciousState = {
    consciousness: 0,
    spo2: 80,
    bloodPressure: "60/40"
  };

  console.log("Unconscious patient:");
  console.log(
    dialogueEngine.respondToTrainee(
      "Where does it hurt?",
      unconsciousState
    )
  );
}

testDialogueEngine();