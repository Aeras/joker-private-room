import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({navigate:vi.fn(),refresh:vi.fn(),verifyPin:vi.fn(),join:vi.fn(),list:vi.fn()}));
vi.mock("@tanstack/react-router",()=>({
  createFileRoute:()=> (options: unknown)=>({options,useSearch:()=>({code:undefined})}),
  useNavigate:()=>mocks.navigate,
}));
vi.mock("@/components/joker/ScreenShell",()=>({ScreenShell:({children}:{children:ReactNode})=><div>{children}</div>,SectionLabel:({children}:{children:ReactNode})=><label>{children}</label>}));
vi.mock("@/hooks/useCurrentActiveGame",()=>({useCurrentActiveGame:()=>({status:"unauthenticated",activeGame:null,refresh:mocks.refresh})}));
vi.mock("@/services/realIdentity",()=>({realIdentityService:{listPlayers:mocks.list,verifyPin:mocks.verifyPin}}));
vi.mock("@/services/roomFunctions",()=>({joinProductionRoom:mocks.join}));
import { Route } from "@/routes/join";
const Component=Route.options.component as ComponentType;
const active={gameId:"owned-game",roomCode:"ABCD",seatIndex:1,lifecycle:"active",stateVersion:10};
beforeEach(()=>{
 vi.resetAllMocks();
 mocks.list.mockResolvedValue([{id:"player",displayName:"Git",role:"player"},{id:"host",displayName:"Giobis",role:"host"}]);
 mocks.verifyPin.mockResolvedValue({ok:true,player:{id:"player",displayName:"Git",role:"player"}});
 mocks.refresh.mockResolvedValue({ok:true,activeGame:active});
});
afterEach(cleanup);
async function enter(code=""){
 render(<Component/>);await screen.findByRole("button",{name:"Git"});
 fireEvent.change(screen.getByLabelText("PIN"),{target:{value:"1234"}});
 if(code)fireEvent.change(screen.getByLabelText("Κωδικός δωματίου"),{target:{value:code}});
 fireEvent.click(screen.getByRole("button",{name:"Είσοδος στο παιχνίδι"}));
}
describe("PIN-first return to owned active game",()=>{
 it("returns to the owned table with no room code",async()=>{
  await enter();await waitFor(()=>expect(mocks.navigate).toHaveBeenCalledWith({to:"/table",search:{code:"ABCD",gameId:"owned-game"}}));
  expect(mocks.verifyPin).toHaveBeenCalledWith("player","1234");expect(mocks.join).not.toHaveBeenCalled();
 });
 it("prefers the active game over an entered different room",async()=>{
  await enter("WXYZ");await waitFor(()=>expect(mocks.navigate).toHaveBeenCalledWith({to:"/table",search:{code:"ABCD",gameId:"owned-game"}}));expect(mocks.join).not.toHaveBeenCalled();
 });
 it("asks for a room code only after confirming no active game",async()=>{
  mocks.refresh.mockResolvedValue({ok:true,activeGame:null});await enter();
  await screen.findByText(/Δεν έχεις ενεργό παιχνίδι/);expect(mocks.verifyPin).toHaveBeenCalledOnce();expect(mocks.join).not.toHaveBeenCalled();
 });
 it("still joins a new room with a valid code when no game is active",async()=>{
  mocks.refresh.mockResolvedValue({ok:true,activeGame:null});mocks.join.mockResolvedValue({ok:true,room:{code:"WXYZ"}});
  await enter("WXYZ");await waitFor(()=>expect(mocks.navigate).toHaveBeenCalledWith({to:"/lobby",search:{code:"WXYZ"}}));expect(mocks.join).toHaveBeenCalledOnce();
 });
 it.each(["SERVICE_UNAVAILABLE","NOT_AUTHENTICATED"])("never joins when active lookup fails: %s",async code=>{
  mocks.refresh.mockResolvedValue({ok:false,code});await enter("WXYZ");await waitFor(()=>expect(mocks.refresh).toHaveBeenCalledOnce());
  await waitFor(()=>expect(screen.getByRole("button",{name:"Είσοδος στο παιχνίδι"})).not.toBeDisabled());expect(mocks.join).not.toHaveBeenCalled();expect(mocks.navigate).not.toHaveBeenCalled();
 });
 it("does not look up or expose a room after wrong PIN",async()=>{
  mocks.verifyPin.mockResolvedValue({ok:false,code:"INVALID_CREDENTIALS"});await enter();await waitFor(()=>expect(mocks.verifyPin).toHaveBeenCalledOnce());expect(mocks.refresh).not.toHaveBeenCalled();expect(mocks.navigate).not.toHaveBeenCalled();
 });
 it("allows the host identity to return via the same PIN flow",async()=>{
  render(<Component/>);fireEvent.click(await screen.findByRole("button",{name:"Giobis"}));fireEvent.change(screen.getByLabelText("PIN"),{target:{value:"1234"}});
  fireEvent.click(screen.getByRole("button",{name:"Είσοδος στο παιχνίδι"}));await waitFor(()=>expect(mocks.verifyPin).toHaveBeenCalledWith("host","1234"));
 });
});
