import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CreateGame } from "@/routes/create";
import { getCurrentPlayer } from "@/services/authFunctions";
import { getAvailableRulesets } from "@/services/roomFunctions";
vi.mock("@tanstack/react-router",()=>({createFileRoute:()=>()=>({}),useNavigate:()=>vi.fn()}));
vi.mock("@/components/joker/ScreenShell",()=>({ScreenShell:({children}:{children:React.ReactNode})=><div>{children}</div>,SectionLabel:({children}:{children:React.ReactNode})=><div>{children}</div>}));
vi.mock("@/hooks/useCurrentActiveGame",()=>({useCurrentActiveGame:()=>({status:"none",refresh:vi.fn()})}));
vi.mock("@/services/authFunctions",()=>({getCurrentPlayer:vi.fn()}));
vi.mock("@/services/roomFunctions",()=>({getAvailableRulesets:vi.fn(),createProductionRoom:vi.fn()}));
vi.mock("@/services/realIdentity",()=>({realIdentityService:{listPlayers:()=>Promise.resolve([]),verifyPin:vi.fn()}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});

it("never flashes PIN controls while a valid session and ruleset options load",async()=>{
  let resolveSession:(value:Awaited<ReturnType<typeof getCurrentPlayer>>)=>void=()=>{};
  let resolveOptions:(value:Awaited<ReturnType<typeof getAvailableRulesets>>)=>void=()=>{};
  vi.mocked(getCurrentPlayer).mockReturnValue(new Promise(resolve=>{resolveSession=resolve;}) as ReturnType<typeof getCurrentPlayer>);
  vi.mocked(getAvailableRulesets).mockReturnValue(new Promise(resolve=>{resolveOptions=resolve;}) as ReturnType<typeof getAvailableRulesets>);
  const view=render(<CreateGame/>);
  expect(view.getByRole("status")).toHaveTextContent("Έλεγχος σύνδεσης");
  expect(view.container.querySelector("select,input[type=password]")).toBeNull();
  await act(async()=>resolveSession({id:"host",displayName:"Host",role:"player"}));
  expect(view.container.querySelector("select,input[type=password]")).toBeNull();
  await act(async()=>resolveOptions({ok:true,options:[{id:"popular",name:"Popular",description:""}]}));
  expect(view.container.querySelector("input[type=password]")).toBeNull();
  expect(view.queryByRole("status")).toBeNull();
});

it("shows login only after confirming there is no session",async()=>{
  vi.mocked(getCurrentPlayer).mockResolvedValue(null);
  const view=render(<CreateGame/>);expect(view.container.querySelector("select")).toBeNull();
  await act(async()=>{});
  expect(view.container.querySelector("select")).not.toBeNull();
});

