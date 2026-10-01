import { useCallback, useState } from "react";
import Registration from "../components/Registration";
import ParticipantConsole from "./ParticipantConsole";

/**
 * Registration/approval gate first; the console (and all its timers/heartbeats) mounts only
 * after the admin approves. If the admin deactivates a participant while they are on the
 * canvas, they drop back to the waiting screen and re-enter automatically when re-activated.
 */
export default function ParticipantPage() {
  const [approved, setApproved] = useState(false);
  const onApproved = useCallback(() => setApproved(true), []);
  const onRevoked = useCallback(() => setApproved(false), []);
  return approved ? <ParticipantConsole onRevoked={onRevoked} /> : <Registration onApproved={onApproved} />;
}
