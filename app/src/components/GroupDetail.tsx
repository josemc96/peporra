import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Avatar,
  Button,
  Dialog,
  Divider,
  IconButton,
  List,
  Portal,
  Surface,
  Text,
  useTheme,
} from 'react-native-paper';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';

import { groupsApi, GroupMember } from '@/api/groups';
import { adminGroupApi } from '@/api/adminGroup';
import { useAuth } from '@/context/AuthContext';

function MemberRow({
  member,
  isAdmin,
  canKick,
  onKick,
}: {
  member: GroupMember;
  isAdmin: boolean;
  canKick: boolean;
  onKick: () => void;
}) {
  return (
    <List.Item
      title={member.alias}
      description={member.email}
      left={() => <Avatar.Text size={36} label={member.alias.slice(0, 2).toUpperCase()} />}
      right={() => (
        <View style={styles.memberRight}>
          {isAdmin && (
            <View style={styles.adminChip}>
              <Text variant="labelSmall" style={styles.adminChipText}>Admin</Text>
            </View>
          )}
          {canKick && (
            <IconButton icon="account-remove" size={20} onPress={onKick} />
          )}
        </View>
      )}
    />
  );
}

interface Props {
  groupId: string;
  onLeave: () => void;
}

export function GroupDetail({ groupId, onLeave }: Props) {
  const { user } = useAuth();
  const theme = useTheme();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [kickTarget, setKickTarget] = useState<GroupMember | null>(null);

  const { data: group, isLoading, isError } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => groupsApi.get(groupId),
  });

  const { data: settings } = useQuery({
    queryKey: ['rule-settings', groupId, group?.season],
    queryFn: () => adminGroupApi.getRuleSettings(groupId, group!.season),
    enabled: !!group,
  });

  const { mutate: leaveGroup, isPending: leaving } = useMutation({
    mutationFn: () => groupsApi.leave(groupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      setConfirmLeave(false);
      onLeave();
    },
  });

  const { mutate: kickMember, isPending: kicking } = useMutation({
    mutationFn: (userId: string) => groupsApi.kick(groupId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', groupId] });
      setKickTarget(null);
    },
  });

  async function copyCode() {
    if (!group) return;
    await Clipboard.setStringAsync(group.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError || !group) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>No se pudo cargar la peña</Text>
        <Button onPress={onLeave} style={{ marginTop: 12 }}>Volver a peñas</Button>
      </View>
    );
  }

  const isGroupAdmin = user?.id === group.admin._id;
  const feats = settings?.enabledFeatures ?? [];
  const comps = settings?.enabledCompetitions ?? [];
  const hasStandings = feats.includes('standings');
  const hasPichichi = feats.includes('pichichi');
  const hasZamora = feats.includes('zamora');
  const hasKnockout = comps.includes('copa_del_rey') || comps.includes('supercopa');

  return (
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <Text variant="headlineSmall" style={styles.groupName}>{group.name}</Text>
        <Text variant="bodyMedium" style={styles.season}>Temporada {group.season}</Text>

        <Surface style={styles.codeBox} elevation={1}>
          <View style={styles.codeRow}>
            <View>
              <Text variant="labelSmall" style={styles.codeLabel}>Código de invitación</Text>
              <Text variant="titleMedium" style={styles.codeValue}>{group.inviteCode}</Text>
            </View>
            <Button mode="outlined" compact icon={copied ? 'check' : 'content-copy'} onPress={copyCode}>
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </View>
        </Surface>

        <View style={styles.actionButtons}>
          <Button
            mode="contained"
            icon="soccer"
            style={styles.actionButton}
            onPress={() => router.push({ pathname: '/predictions/[season]', params: { season: group.season, groupId: group._id } })}
          >
            Predicciones
          </Button>
          <Button
            mode="contained-tonal"
            icon="trophy"
            style={styles.actionButton}
            onPress={() => router.push({ pathname: '/ranking/[groupId]', params: { groupId: group._id, season: group.season } })}
          >
            Ranking
          </Button>
        </View>

        <Button
          mode="outlined"
          icon="cards-playing"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push({ pathname: '/cards/[groupId]' as any, params: { groupId: group._id, season: group.season, matchday: '1' } })}
        >
          Mis cartas
        </Button>

        {hasKnockout && (
          <Button
            mode="outlined"
            icon="trophy-outline"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPress={() => router.push({ pathname: '/knockout/[season]' as any, params: { season: group.season } })}
          >
            Copa / Supercopa
          </Button>
        )}

        {(hasStandings || hasPichichi || hasZamora) && (
          <View style={styles.secondaryButtons}>
            {hasStandings && (
              <Button
                mode="outlined"
                icon="table"
                style={styles.halfButton}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onPress={() => router.push({ pathname: '/standings-prediction/[season]' as any, params: { season: group.season } })}
              >
                Clasificación
              </Button>
            )}
            {(hasPichichi || hasZamora) && (
              <Button
                mode="outlined"
                icon="medal"
                style={styles.halfButton}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onPress={() => router.push({ pathname: '/award-prediction/[season]' as any, params: { season: group.season, groupId: group._id } })}
              >
                Premios
              </Button>
            )}
          </View>
        )}

        <Divider style={styles.divider} />

        <Text variant="titleSmall" style={styles.sectionTitle}>
          Miembros ({group.members.length})
        </Text>

        {group.members.map((member) => (
          <MemberRow
            key={member._id}
            member={member}
            isAdmin={member._id === group.admin._id}
            canKick={isGroupAdmin && member._id !== group.admin._id}
            onKick={() => setKickTarget(member)}
          />
        ))}

        <Divider style={styles.divider} />

        {isGroupAdmin ? (
          <Button
            mode="contained-tonal"
            icon="cog"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPress={() => router.push({ pathname: '/admin/[groupId]' as any, params: { groupId: group._id, season: group.season } })}
          >
            Panel de admin
          </Button>
        ) : (
          <Button
            mode="outlined"
            icon="exit-to-app"
            textColor={theme.colors.error}
            style={{ borderColor: theme.colors.error }}
            onPress={() => setConfirmLeave(true)}
          >
            Abandonar peña
          </Button>
        )}

        <Button mode="text" icon="swap-horizontal" onPress={onLeave} style={{ marginTop: 4 }}>
          Cambiar de peña
        </Button>
      </ScrollView>

      {/* Confirm leave */}
      <Portal>
        <Dialog visible={confirmLeave} onDismiss={() => setConfirmLeave(false)}>
          <Dialog.Title>Abandonar peña</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              ¿Seguro que quieres abandonar <Text style={{ fontWeight: '700' }}>{group.name}</Text>? Perderás el acceso a las predicciones y el ranking de esta peña.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmLeave(false)}>Cancelar</Button>
            <Button
              textColor={theme.colors.error}
              loading={leaving}
              disabled={leaving}
              onPress={() => leaveGroup()}
            >
              Abandonar
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Confirm kick */}
        <Dialog visible={!!kickTarget} onDismiss={() => setKickTarget(null)}>
          <Dialog.Title>Expulsar miembro</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              ¿Expulsar a <Text style={{ fontWeight: '700' }}>{kickTarget?.alias}</Text> de la peña?
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setKickTarget(null)}>Cancelar</Button>
            <Button
              textColor={theme.colors.error}
              loading={kicking}
              disabled={kicking}
              onPress={() => kickTarget && kickMember(kickTarget._id)}
            >
              Expulsar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 16, gap: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  groupName: { marginBottom: 2 },
  season: { opacity: 0.6, marginBottom: 16 },
  actionButtons: { flexDirection: 'row', gap: 10, marginVertical: 4 },
  actionButton: { flex: 1 },
  secondaryButtons: { flexDirection: 'row', gap: 10 },
  halfButton: { flex: 1 },
  codeBox: { borderRadius: 8, padding: 16, marginVertical: 8 },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  codeLabel: { opacity: 0.6, marginBottom: 2 },
  codeValue: { letterSpacing: 2 },
  divider: { marginVertical: 12 },
  sectionTitle: { marginBottom: 4, opacity: 0.7 },
  memberRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  adminChip: { backgroundColor: '#E8F4FD', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, alignSelf: 'center' },
  adminChipText: { color: '#1565C0' },
  errorText: { color: '#9C3B2C' },
});
