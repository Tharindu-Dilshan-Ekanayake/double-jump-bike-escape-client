import { useGameStore } from '../../store/gameStore'
import { FeedbackPanel, ItemShopPanel } from './ItemShopPanel'
import {
  CodesPanel,
  InventoryPanel,
  PlayersPanel,
  QuestsPanel,
  RebirthPanel,
  SettingsPanel,
  WelcomePanel,
  WorldsPanel,
} from './PlayerPanels'
import {
  BikeSpeedPanel,
  ShopPanel,
  ItemsPanel,
  PadPanel,
  WinsShopPanel,
} from './ShopPanels'

function renderPanel(id, me, props) {
  switch (id) {
    case 'items':
      return <ItemsPanel me={me} props={props} />
    case 'winsShop':
      return <WinsShopPanel me={me} />
    case 'bikeSpeed':
      return <BikeSpeedPanel me={me} />
    case 'shop':
      return <ShopPanel me={me} props={props} />
    case 'pad':
      return <PadPanel me={me} props={props} />
    case 'inventory':
      return <InventoryPanel me={me} props={props} />
    case 'rebirth':
      return <RebirthPanel me={me} />
    case 'quests':
      return <QuestsPanel me={me} />
    case 'codes':
      return <CodesPanel />
    case 'settings':
      return <SettingsPanel />
    case 'players':
      return <PlayersPanel />
    case 'worlds':
      return <WorldsPanel me={me} />
    case 'welcome':
      return <WelcomePanel />
    case 'itemShop':
      return <ItemShopPanel me={me} />
    case 'feedback':
      return <FeedbackPanel />
    default:
      return null
  }
}

/** Renders whichever window is open (one at a time, like Roblox UIs). */
export function Panels() {
  const panel = useGameStore((s) => s.panel)
  const me = useGameStore((s) => s.me)
  const phase = useGameStore((s) => s.phase)
  if (phase !== 'playing' || !me) return null
  return (
    <>
      {panel && <div key={`${panel.id}:${panel.props?.tab ?? ''}`}>{renderPanel(panel.id, me, panel.props || {})}</div>}
    </>
  )
}

export default Panels
