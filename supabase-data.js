(function () {
  const client = window.lmSupabase;
  let context = null;
  let syncTimer = null;

  const numberFrom = value => Number(String(value ?? 0).replace(/[^0-9.-]/g, '')) || 0;

  function mapDriver(row) {
    return { databaseId: row.id, name: row.name, phone: row.phone, email: row.email, license: row.license_number, until: row.license_valid_until || 'Do uzupełnienia', status: row.status };
  }
  function mapVehicle(row) {
    return { databaseId: row.id, truck: row.registration_number, model: row.model, year: row.production_year || '—', vin: row.vin, type: row.vehicle_type, driver: row.assigned_driver, state: row.status, gpsConnected: row.gps_connected, gps: row.gps_label, km: `${Number(row.daily_km) || 0} km`, speed: `${Number(row.speed_kmh) || 0} km/h`, fuelLevel: row.fuel_level, fuelUsage: row.fuel_usage };
  }
  function mapTransport(row) {
    return { databaseId: row.id, id: row.transport_number, client: row.client, from: row.origin, to: row.destination, driver: row.driver_name, truck: row.vehicle_registration, trailer: row.trailer, notes: row.notes, progress: row.progress, left: row.distance_left, eta: row.eta, status: row.status, tone: row.tone, recipient: row.recipient, gpsLocation: row.gps_location };
  }

  async function loadRemoteWorkspace(session) {
    if (!client || !session?.user) return null;
    const { data: profile, error: profileError } = await client.from('profiles').select('organization_id').eq('user_id', session.user.id).single();
    if (profileError) throw profileError;
    context = { organizationId: profile.organization_id, email: session.user.email.toLowerCase() };
    const [{ data: driverRows, error: driverError }, { data: vehicleRows, error: vehicleError }, { data: transportRows, error: transportError }, { data: settingsRow, error: settingsError }] = await Promise.all([
      client.from('drivers').select('*').order('created_at'),
      client.from('vehicles').select('*').order('created_at'),
      client.from('transports').select('*').order('created_at', { ascending: false }),
      client.from('organization_settings').select('configuration').eq('organization_id', profile.organization_id).maybeSingle(),
    ]);
    const error = driverError || vehicleError || transportError || settingsError;
    if (error) throw error;
    const remoteWorkspace = { drivers: (driverRows || []).map(mapDriver), fleet: (vehicleRows || []).map(mapVehicle), transports: (transportRows || []).map(mapTransport), updatedAt: new Date().toISOString() };
    const workspaceKey = `lm_workspace_${context.email}`;
    let localWorkspace = null;
    try { localWorkspace = JSON.parse(localStorage.getItem(workspaceKey) || 'null'); } catch {}
    const remoteIsEmpty = !remoteWorkspace.drivers.length && !remoteWorkspace.fleet.length && !remoteWorkspace.transports.length;
    const hasLocalData = localWorkspace && (localWorkspace.drivers?.length || localWorkspace.fleet?.length || localWorkspace.transports?.length);
    const selectedWorkspace = remoteIsEmpty && hasLocalData ? localWorkspace : remoteWorkspace;
    localStorage.setItem(workspaceKey, JSON.stringify(selectedWorkspace));
    if (settingsRow?.configuration) localStorage.setItem(`lm_user_${context.email}_settings`, JSON.stringify(settingsRow.configuration));
    if (remoteIsEmpty && hasLocalData) await syncWorkspace(localWorkspace);
    window.lmRemoteContext = context;
    return selectedWorkspace;
  }

  async function reconcile(table, rows, naturalKey) {
    const organizationId = context.organizationId;
    const payload = rows.map(row => ({ ...row, organization_id: organizationId, updated_at: new Date().toISOString() }));
    if (payload.length) {
      const { error } = await client.from(table).upsert(payload, { onConflict: `organization_id,${naturalKey}` });
      if (error) throw error;
    }
    const { data: existing, error: selectError } = await client.from(table).select(`id,${naturalKey}`);
    if (selectError) throw selectError;
    const retained = new Set(payload.map(row => String(row[naturalKey]).toLowerCase()));
    const obsoleteIds = (existing || []).filter(row => !retained.has(String(row[naturalKey]).toLowerCase())).map(row => row.id);
    if (obsoleteIds.length) {
      const { error } = await client.from(table).delete().in('id', obsoleteIds);
      if (error) throw error;
    }
  }

  async function syncWorkspace(workspace) {
    if (!context || !workspace) return;
    const drivers = (workspace.drivers || []).map(item => ({ name: item.name, phone: item.phone || '', email: item.email || '', license_number: item.license || '', license_valid_until: /^\d{4}-\d{2}-\d{2}$/.test(item.until || '') ? item.until : null, status: item.status || 'Dostępny' }));
    const vehicles = (workspace.fleet || []).map(item => ({ registration_number: item.truck, model: item.model || '', production_year: Number(item.year) || null, vin: item.vin || '', vehicle_type: item.type || 'Ciągnik siodłowy', assigned_driver: item.driver || 'Nie przypisano', status: item.state || 'Dostępny', gps_connected: Boolean(item.gpsConnected), gps_label: item.gps || 'Brak synchronizacji', daily_km: numberFrom(item.km), speed_kmh: numberFrom(item.speed), fuel_level: Number.isFinite(Number(item.fuelLevel)) ? Number(item.fuelLevel) : null, fuel_usage: Number.isFinite(Number(item.fuelUsage)) ? Number(item.fuelUsage) : null }));
    const transports = (workspace.transports || []).map(item => ({ transport_number: item.id, client: item.client, origin: item.from, destination: item.to, driver_name: item.driver || 'Nie przypisano', vehicle_registration: item.truck || 'Nie przypisano', trailer: item.trailer || 'Nie przypisano', notes: item.notes || '', progress: Number(item.progress) || 0, distance_left: item.left || '—', eta: item.eta || '—', status: item.status || 'Nowy', tone: item.tone || 'blue', recipient: item.recipient || '', gps_location: item.gpsLocation || '' }));
    await Promise.all([reconcile('drivers', drivers, 'name'), reconcile('vehicles', vehicles, 'registration_number'), reconcile('transports', transports, 'transport_number')]);
  }

  function queueRemoteWorkspaceSync(workspace) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncWorkspace(workspace).catch(error => console.error('Błąd synchronizacji Supabase:', error)), 250);
  }

  async function syncSettings(configuration) {
    if (!context) return;
    const { error } = await client.from('organization_settings').upsert({ organization_id: context.organizationId, configuration, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  window.loadRemoteWorkspace = loadRemoteWorkspace;
  window.queueRemoteWorkspaceSync = queueRemoteWorkspaceSync;
  window.syncRemoteSettings = configuration => syncSettings(configuration).catch(error => console.error('Błąd synchronizacji ustawień:', error));
})();
