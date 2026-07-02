import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useProfileStore } from '../stores/profile';
import { tryDevAutoLogin } from '../utils/devAuth';
import LoginView from '../views/LoginView.vue';
import OnboardingView from '../views/OnboardingView.vue';
import DashboardView from '../views/DashboardView.vue';
import JobsView from '../views/JobsView.vue';
import ApplicationsView from '../views/ApplicationsView.vue';
import GeneratorView from '../views/GeneratorView.vue';
import AgentView from '../views/AgentView.vue';
import AnalyticsView from '../views/AnalyticsView.vue';
import UsersView from '../views/UsersView.vue';
import ProfileView from '../views/ProfileView.vue';
import ApprovalsView from '../views/ApprovalsView.vue';
import ChatView from '../views/ChatView.vue';
import IntelligenceView from '../views/IntelligenceView.vue';
import InterviewView from '../views/InterviewView.vue';
import ConferencesView from '../views/ConferencesView.vue';
import SocialView from '../views/SocialView.vue';
import SwarmView from '../views/SwarmView.vue';
import LandingView from '../views/LandingView.vue';
import OutcomesView from '../views/OutcomesView.vue';
import ResumesView from '../views/ResumesView.vue';
import CalendarView from '../views/CalendarView.vue';
import LegalView from '../views/LegalView.vue';
import LinkedInWorkflowView from '../views/LinkedInWorkflowView.vue';
import FollowUpView from '../views/FollowUpView.vue';
import TailoredResumesView from '../views/TailoredResumesView.vue';
import MonitorLayout from '../views/monitor/MonitorLayout.vue';
import MonitorOverviewView from '../views/monitor/MonitorOverviewView.vue';
import MonitorPipelineView from '../views/monitor/MonitorPipelineView.vue';
import MonitorAgentView from '../views/monitor/MonitorAgentView.vue';
import MonitorSwarmView from '../views/monitor/MonitorSwarmView.vue';
import MonitorApplicationsView from '../views/monitor/MonitorApplicationsView.vue';
import ConciergeView from '../views/ConciergeView.vue';
import { showAskAi } from '../config';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/welcome', component: LandingView, meta: { guest: true } },
    { path: '/login', component: LoginView, meta: { guest: true } },
    { path: '/privacy', component: LegalView, meta: { guest: true } },
    { path: '/terms', component: LegalView, meta: { guest: true } },
    { path: '/onboarding', component: OnboardingView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/', component: DashboardView, meta: { requiresAuth: true } },
    { path: '/concierge', component: ConciergeView, meta: { requiresAuth: true, skipOnboarding: true } },
    {
      path: '/monitor',
      component: MonitorLayout,
      meta: { requiresAuth: true, skipOnboarding: true, adminOnly: true },
      children: [
        { path: '', component: MonitorOverviewView },
        { path: 'pipeline', component: MonitorPipelineView },
        { path: 'agent', component: MonitorAgentView },
        { path: 'swarm', component: MonitorSwarmView },
        { path: 'applications', component: MonitorApplicationsView },
      ],
    },
    { path: '/profile', component: ProfileView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/jobs', component: JobsView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/approvals', component: ApprovalsView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/follow-ups', component: FollowUpView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/tailored-resumes', component: TailoredResumesView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/linkedin', component: LinkedInWorkflowView, meta: { requiresAuth: true, skipOnboarding: true, adminOnly: true } },
    { path: '/chat', component: ChatView, meta: { requiresAuth: true, skipOnboarding: true, adminOnly: true } },
    { path: '/intelligence', component: IntelligenceView, meta: { requiresAuth: true, skipOnboarding: true, adminOnly: true } },
    { path: '/interview', component: InterviewView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/conferences', component: ConferencesView, meta: { requiresAuth: true, skipOnboarding: true, adminOnly: true } },
    { path: '/social', component: SocialView, meta: { requiresAuth: true, skipOnboarding: true, adminOnly: true } },
    { path: '/outcomes', component: OutcomesView, meta: { requiresAuth: true, skipOnboarding: true, adminOnly: true } },
    { path: '/swarm', component: SwarmView, meta: { requiresAuth: true, skipOnboarding: true, adminOnly: true } },
    { path: '/resumes', component: ResumesView, meta: { requiresAuth: true, skipOnboarding: true, adminOnly: true } },
    { path: '/calendar', component: CalendarView, meta: { requiresAuth: true, skipOnboarding: true, adminOnly: true } },
    { path: '/applications', component: ApplicationsView, meta: { requiresAuth: true, skipOnboarding: true, adminOnly: true } },
    { path: '/generator', component: GeneratorView, meta: { requiresAuth: true, adminOnly: true } },
    { path: '/agent', component: AgentView, meta: { requiresAuth: true, adminOnly: true } },
    { path: '/analytics', component: AnalyticsView, meta: { requiresAuth: true, adminOnly: true } },
    { path: '/users', component: UsersView, meta: { requiresAuth: true, adminOnly: true, skipOnboarding: true } },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (import.meta.env.DEV && !auth.accessToken) {
    await tryDevAutoLogin(auth);
  }

  if (to.meta.requiresAuth && !auth.accessToken) return '/login';
  if (to.meta.guest && auth.accessToken && !['/welcome', '/privacy', '/terms'].includes(to.path)) return '/';
  if (!showAskAi && to.path === '/concierge') return '/';
  if (to.matched.some((record) => record.meta.adminOnly) && auth.user?.role !== 'admin') return '/';

  if (auth.accessToken && to.meta.requiresAuth) {
    const profileStore = useProfileStore();
    if (!profileStore.loaded && !profileStore.fetching) {
      profileStore.hydrateFromCache();
      try {
        await profileStore.fetch();
      } catch {
        /* cached profile may still be shown */
      }
    }

    if (
      !to.meta.skipOnboarding &&
      !profileStore.complete &&
      !profileStore.profile?.mongoRequired &&
      !profileStore.profile?.onboardingComplete &&
      to.path !== '/onboarding'
    ) {
      return '/onboarding';
    }
  }
});

export default router;
