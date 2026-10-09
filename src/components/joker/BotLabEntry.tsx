import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { botLabRequest } from "@/services/botLabFunctions";
export function BotLabEntry() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let live = true;
    botLabRequest({ data: { action: "access" } })
      .then((r) => {
        if (live && r.ok && JSON.parse(r.json).allowed === true) setAllowed(true);
      })
      .catch(() => {
        if (live) setAllowed(false);
      });
    return () => {
      live = false;
    };
  }, []);
  return allowed ? <Link to="/bot-lab">Bot Lab</Link> : null;
}
