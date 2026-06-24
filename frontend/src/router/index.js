import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useProfileStore } from '../stores/profile';
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

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/welcome', component: LandingView, meta: { guest: true } },
    { path: '/login', component: LoginView, meta: { guest: true } },
    { path: '/privacy', component: LegalView, meta: { guest: true } },
    { path: '/terms', component: LegalView, meta: { guest: true } },
    { path: '/onboarding', component: OnboardingView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/', component: DashboardView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/profile', component: ProfileView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/jobs', component: JobsView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/approvals', component: ApprovalsView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/linkedin', component: LinkedInWorkflowView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/chat', component: ChatView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/intelligence', component: IntelligenceView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/interview', component: InterviewView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/conferences', component: ConferencesView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/social', component: SocialView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/outcomes', component: OutcomesView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/swarm', component: SwarmView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/resumes', component: ResumesView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/calendar', component: CalendarView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/applications', component: ApplicationsView, meta: { requiresAuth: true, skipOnboarding: true } },
    { path: '/generator', component: GeneratorView, meta: { requiresAuth: true } },
    { path: '/agent', component: AgentView, meta: { requiresAuth: true } },
    { path: '/analytics', component: AnalyticsView, meta: { requiresAuth: true } },
    { path: '/users', component: UsersView, meta: { requiresAuth: true, adminOnly: true, skipOnboarding: true } },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.accessToken) return '/login';
  if (to.meta.guest && auth.accessToken && !['/welcome', '/privacy', '/terms'].includes(to.path)) return '/';
  if (to.meta.adminOnly && auth.user?.role !== 'admin') return '/';

  if (auth.accessToken && to.meta.requiresAuth && !to.meta.skipOnboarding) {
    const profileStore = useProfileStore();
    if (!profileStore.loaded) {
      try {
        await profileStore.fetch();
      } catch {
        return true;
      }
    }
    if (
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
