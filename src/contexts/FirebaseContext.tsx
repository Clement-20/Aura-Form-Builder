import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import {
  createTeamForm,
  createTeamWorkspace,
  deleteTeamForm,
  joinTeamWithCode,
  regenerateTeamInvite,
  removeTeamMember,
  SharedFormDoc,
  subscribeToTeam,
  subscribeToTeamForms,
  subscribeToTeamMembers,
  subscribeToUserTeams,
  syncUserProfile,
  updateTeamMemberRole,
} from '../lib/team-service';
import { FormSchema } from '../types/form';
import { TeamMember, TeamRole, TeamWorkspace, UserTeamMembership } from '../types/team';

interface FirebaseContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  authBusy: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<User | null>;
  signOutUser: () => Promise<void>;

  // Workspace & Teaming state
  memberships: UserTeamMembership[];
  activeWorkspaceId: 'personal' | string;
  setActiveWorkspaceId: (id: 'personal' | string) => void;
  activeTeam: TeamWorkspace | null;
  activeTeamRole: TeamRole | null;
  teamMembers: TeamMember[];
  teamForms: SharedFormDoc[];

  // Actions
  createTeam: (
    name: string,
    description: string,
    defaultRole?: 'editor' | 'viewer'
  ) => Promise<string>;
  joinTeam: (code: string) => Promise<{ teamId: string; teamName: string; alreadyMember: boolean }>;
  changeMemberRole: (memberUid: string, role: 'editor' | 'viewer') => Promise<void>;
  kickMember: (memberUid: string) => Promise<void>;
  leaveActiveTeam: () => Promise<void>;
  rotateInviteCode: (defaultRole?: 'editor' | 'viewer') => Promise<string | null>;
  createSharedForm: (baseForm: FormSchema, targetTeamId?: string) => Promise<SharedFormDoc | null>;
  deleteSharedForm: (formId: string) => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [memberships, setMemberships] = useState<UserTeamMembership[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<'personal' | string>('personal');
  const [activeTeam, setActiveTeam] = useState<TeamWorkspace | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamForms, setTeamForms] = useState<SharedFormDoc[]>([]);

  // 1. Auth state listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);
      setAuthReady(true);
      if (u && u.emailVerified) {
        try {
          await syncUserProfile(u);
        } catch (err) {
          console.error('Profile sync warning:', err);
        }
      } else if (!u) {
        setMemberships([]);
        setActiveWorkspaceId('personal');
        setActiveTeam(null);
        setTeamMembers([]);
        setTeamForms([]);
      }
    });
    return () => unsub();
  }, []);

  // 2. Subscribe to user's team memberships only when signed in
  useEffect(() => {
    if (!authReady || !firebaseUser) {
      setMemberships([]);
      return;
    }
    const unsub = subscribeToUserTeams(firebaseUser.uid, (list) => {
      setMemberships(list);
      // If active team was deleted or user removed, fall back to personal
      setActiveWorkspaceId((prev) => {
        if (prev === 'personal') return 'personal';
        return list.some((m) => m.teamId === prev) ? prev : 'personal';
      });
    });
    return () => unsub();
  }, [authReady, firebaseUser]);

  // 3. Subscribe to active team metadata, members, and shared forms
  useEffect(() => {
    if (!authReady || !firebaseUser || activeWorkspaceId === 'personal') {
      setActiveTeam(null);
      setTeamMembers([]);
      setTeamForms([]);
      return;
    }

    const unsubTeam = subscribeToTeam(activeWorkspaceId, setActiveTeam);
    const unsubMembers = subscribeToTeamMembers(activeWorkspaceId, setTeamMembers);
    const unsubForms = subscribeToTeamForms(activeWorkspaceId, setTeamForms);

    return () => {
      unsubTeam();
      unsubMembers();
      unsubForms();
    };
  }, [authReady, firebaseUser, activeWorkspaceId]);

  const activeTeamRole: TeamRole | null = useMemo(() => {
    if (!firebaseUser || activeWorkspaceId === 'personal') return null;
    const member = teamMembers.find((m) => m.uid === firebaseUser.uid);
    if (member) return member.role;
    const mship = memberships.find((m) => m.teamId === activeWorkspaceId);
    return mship?.role ?? null;
  }, [firebaseUser, activeWorkspaceId, teamMembers, memberships]);

  const signInWithGoogle = async (): Promise<User | null> => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      return cred.user;
    } catch (err: any) {
      const msg =
        err?.code === 'auth/popup-closed-by-user'
          ? 'Sign-in cancelled.'
          : err?.message || 'Could not complete Google sign-in.';
      setAuthError(msg);
      return null;
    } finally {
      setAuthBusy(false);
    }
  };

  const signOutUser = async () => {
    setAuthBusy(true);
    try {
      await signOut(auth);
      setActiveWorkspaceId('personal');
    } finally {
      setAuthBusy(false);
    }
  };

  const createTeam = async (
    name: string,
    description: string,
    defaultRole: 'editor' | 'viewer' = 'editor'
  ): Promise<string> => {
    if (!firebaseUser) throw new Error('Please sign in with Google first.');
    const teamId = await createTeamWorkspace(firebaseUser, name, description, defaultRole);
    setActiveWorkspaceId(teamId);
    return teamId;
  };

  const joinTeam = async (code: string) => {
    if (!firebaseUser) throw new Error('Please sign in with Google first.');
    const res = await joinTeamWithCode(firebaseUser, code);
    setActiveWorkspaceId(res.teamId);
    return res;
  };

  const changeMemberRole = async (memberUid: string, role: 'editor' | 'viewer') => {
    if (!activeTeam) return;
    await updateTeamMemberRole(activeTeam.id, memberUid, role);
  };

  const kickMember = async (memberUid: string) => {
    if (!activeTeam) return;
    await removeTeamMember(activeTeam.id, memberUid);
  };

  const leaveActiveTeam = async () => {
    if (!activeTeam || !firebaseUser) return;
    await removeTeamMember(activeTeam.id, firebaseUser.uid);
    setActiveWorkspaceId('personal');
  };

  const rotateInviteCode = async (defaultRole: 'editor' | 'viewer' = 'editor') => {
    if (!activeTeam || !firebaseUser) return null;
    return regenerateTeamInvite(firebaseUser, activeTeam, defaultRole);
  };

  const createSharedForm = async (baseForm: FormSchema, targetTeamId?: string) => {
    const teamId = targetTeamId || (activeWorkspaceId !== 'personal' ? activeWorkspaceId : '');
    if (!firebaseUser || !teamId) return null;
    return createTeamForm(teamId, firebaseUser, baseForm);
  };

  const deleteSharedForm = async (formId: string) => {
    if (!activeTeam) return;
    await deleteTeamForm(activeTeam.id, formId);
  };

  return (
    <FirebaseContext.Provider
      value={{
        firebaseUser,
        authReady,
        authBusy,
        authError,
        signInWithGoogle,
        signOutUser,
        memberships,
        activeWorkspaceId,
        setActiveWorkspaceId,
        activeTeam,
        activeTeamRole,
        teamMembers,
        teamForms,
        createTeam,
        joinTeam,
        changeMemberRole,
        kickMember,
        leaveActiveTeam,
        rotateInviteCode,
        createSharedForm,
        deleteSharedForm,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export function useFirebase(): FirebaseContextValue {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error('useFirebase must be used inside FirebaseProvider');
  }
  return ctx;
}
