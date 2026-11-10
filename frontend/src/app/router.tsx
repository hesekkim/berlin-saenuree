import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from './App';
import NotFound from '../pages/NotFound/NotFound';
import Home from '../pages/Home/Home';
import AdminLayout, {
  AdminIndexRedirect,
} from '../pages/Admin/layout/AdminLayout';
import HomePageEditor from '../pages/Admin/Pages/Home/HomePageEditor';
import Posts from '../pages/Admin/Pages/Posts/Posts';
import Settings from '../pages/Admin/Settings/Settings';
import Popups from '../pages/Admin/Settings/Popups/Popups';
import BloggerPage from '../pages/Admin/Pages/Blogger/Blogger';
import BloggerDocumentEditor from '../pages/Admin/Pages/Blogger/components/BloggerDocumentEditor';
import TrashPage from '../pages/Admin/Pages/Trash/Trash';
import PrivacyPolicy from '../pages/PrivacyPolicy/PrivacyPolicy';
import { isUiLabEnabled } from '../shared/config/features';
import ChurchHistory from '../pages/ChurchHistory/ChurchHistory';
import SeniorPastor from '../pages/SeniorPastor/SeniorPastor';
import ChurchVision from '../pages/ChurchVision/ChurchVision';
import SaenureeNews from '../pages/SaenureeNews/SaenureeNews';
import Visit from '../pages/Visit/Visit';
import VisitPageEditor from '../pages/Admin/Pages/Visit/VisitPageEditor';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <NotFound />,
    children: [
      {
        index: true,
        element: <Navigate to="/home" replace />,
      },
      {
        path: 'home',
        element: <Home />,
      },
      {
        path: 'admin',
        element: <AdminLayout />,
        children: [
          {
            index: true,
            element: <AdminIndexRedirect />,
          },
          {
            path: 'pages/home',
            element: <HomePageEditor />,
          },
          {
            path: 'pages/visit',
            element: <VisitPageEditor />,
          },
          {
            path: 'pages/posts',
            element: <Posts />,
          },
          {
            path: 'pages/blogger',
            element: <BloggerPage />,
          },
          {
            path: 'pages/blogger/new',
            element: <BloggerDocumentEditor mode="create" />,
          },
          {
            path: 'pages/blogger/:id',
            element: <BloggerDocumentEditor mode="edit" />,
          },
          {
            path: 'pages/trash',
            element: <TrashPage />,
          },
          {
            path: 'settings',
            element: <Settings />,
          },
          {
            path: 'settings/popups',
            element: <Popups />,
          },
        ],
      },
      {
        path: 'privacy-policy',
        element: <PrivacyPolicy />,
      },
      {
        path: 'about/church-history',
        element: <ChurchHistory />,
      },
      {
        path: 'about/senior-pastor',
        element: <SeniorPastor />,
      },
      {
        path: 'calling/church-vision',
        element: <ChurchVision />,
      },
      {
        path: 'saenuree-news',
        element: <SaenureeNews />,
      },
      {
        path: 'visit',
        element: <Visit />,
      },
      ...(isUiLabEnabled
        ? [
            {
              path: 'dev/ui-lab',
              lazy: async () => {
                const module = await import('../pages/UiLab/UiLab');
                return { Component: module.default };
              },
            },
          ]
        : []),
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
]);
