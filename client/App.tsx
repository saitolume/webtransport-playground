import { VFC } from 'react'
import { Outlet, ReactLocation, Router } from 'react-location'
import RoomId from '~/pages/:roomId'
import Index from '~/pages/index'

const location = new ReactLocation()

const App: VFC = () => (
  <>
    <Router
      location={location}
      routes={[
        {
          path: '/',
          element: <Index />,
          children: [],
        },
        { path: ':roomId', element: <RoomId /> },
      ]}
    >
      <Outlet />
    </Router>
  </>
)

export default App
