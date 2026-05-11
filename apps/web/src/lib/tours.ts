import type { TourStep } from "../components/OnboardingTour";

export const childTour: TourStep[] = [
  {
    targetId: "tile-balance",
    title: "Your balance",
    body: "These are the credits you can spend on rewards. Earn more by finishing tasks and showing initiative.",
  },
  {
    targetId: "tile-week",
    title: "This week",
    body: "How many credits you've earned and spent since Sunday. It resets every week.",
  },
  {
    targetId: "tile-streak",
    title: "Streak",
    body: "Days in a row you finished at least one task. Don't break the chain — 3 days in a row earns the 'On a Roll' badge.",
  },
  {
    targetId: "tile-initiative",
    title: "Initiative",
    body: "Bonus points for going above and beyond. Tap '+ Suggest initiative' to propose something extra you did.",
  },
  {
    targetId: "tile-today-tasks",
    title: "Today's tasks",
    body: "Tap 'Mark done' when you finish. Some tasks need a photo or notes — a grown-up will approve before credits land.",
  },
];

export const parentTour: TourStep[] = [
  {
    targetId: "tile-pending-badge",
    title: "Pending count",
    body: "How many things need your review right now — task completions, initiative suggestions, and reward requests.",
    placement: "left",
  },
  {
    targetId: "tile-children",
    title: "Your kids",
    body: "Each card shows a child's balance and weekly earned/spent. Pause earning or redemptions per kid in Settings → Kids.",
  },
  {
    targetId: "tile-pending-approvals",
    title: "Pending approvals",
    body: "Task completions and initiative suggestions waiting for you. Approve to award credits, reject to deny without penalty.",
  },
  {
    targetId: "tile-reward-requests",
    title: "Reward requests",
    body: "When a child redeems credits, requests show up here. Approving deducts credits; rejecting refunds them automatically.",
  },
  {
    targetId: "nav-tasks",
    title: "Set up tasks",
    body: "Create chores worth credits. Use one-time for projects or recurring with day-of-week schedules for daily routines.",
    placement: "bottom",
  },
  {
    targetId: "nav-rewards",
    title: "Set up rewards",
    body: "Define what credits buy: screen time, treats, money, activities. You set the cost and any limits.",
    placement: "bottom",
  },
  {
    targetId: "nav-settings",
    title: "Family settings",
    body: "Set your timezone (used for streaks and weekly windows), child login mode, and initiative bonuses here.",
    placement: "bottom",
  },
];
