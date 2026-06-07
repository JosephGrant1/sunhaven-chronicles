package com.sunhaven;

// ============================================================
// Sunhaven Chronicles — SmartFoxServer 2X Extension
//
// Deploy:
//   1. Compile → sunhaven-ext.jar
//   2. Copy jar to:  SFS2X/extensions/SunhavenExt/
//   3. Zone config already references className="com.sunhaven.SunhavenExtension"
// ============================================================

import com.smartfoxserver.v2.extensions.SFSExtension;
import com.smartfoxserver.v2.extensions.BaseClientRequestHandler;
import com.smartfoxserver.v2.entities.User;
import com.smartfoxserver.v2.entities.Room;
import com.smartfoxserver.v2.entities.data.*;
import com.smartfoxserver.v2.api.ISFSApi;
import com.smartfoxserver.v2.core.SFSEvent;
import com.smartfoxserver.v2.core.ISFSEventHandler;
import com.smartfoxserver.v2.exceptions.SFSException;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class SunhavenExtension extends SFSExtension {

    // Track player zones so we can broadcast to correct room
    private final ConcurrentHashMap<String, String> playerZones = new ConcurrentHashMap<>();

    @Override
    public void init() {
        trace("SunhavenExtension starting up...");

        // Client → Server request handlers
        addRequestHandler("zoneChange",    ZoneChangeHandler.class);
        addRequestHandler("battleResult",  BattleResultHandler.class);
        addRequestHandler("playerState",   PlayerStateHandler.class);

        // Server-side event listeners
        addEventHandler(SFSEvent.USER_DISCONNECT, UserDisconnectHandler.class);

        trace("SunhavenExtension ready.");
    }

    @Override
    public void destroy() {
        trace("SunhavenExtension shutting down.");
    }

    // ----------------------------------------------------------------
    // Handler: zoneChange — player moves between town / forest rooms
    // Params: { zone: "town" | "forest" }
    // ----------------------------------------------------------------
    public class ZoneChangeHandler extends BaseClientRequestHandler {
        @Override
        public void handleClientRequest(User sender, ISFSObject params) {
            String targetZone = params.getUtfString("zone");
            String targetRoom = "town".equals(targetZone) ? "Sunhaven Town" : leastPopulatedForest();

            try {
                // Move user to the target room
                ISFSApi api = getParentExtension().getApi();
                Room room = getParentExtension().getParentZone().getRoomByName(targetRoom);
                if (room != null) {
                    api.joinRoom(sender, room, null, null, true);
                    playerZones.put(sender.getName(), targetZone);

                    ISFSObject response = SFSObject.newInstance();
                    response.putUtfString("zone", targetZone);
                    response.putUtfString("room", targetRoom);
                    send("zoneAck", response, sender);
                }
            } catch (SFSException e) {
                trace("ZoneChange error for " + sender.getName() + ": " + e.getMessage());
            }
        }

        private String leastPopulatedForest() {
            Room f1 = getParentExtension().getParentZone().getRoomByName("Dark Forest 1");
            Room f2 = getParentExtension().getParentZone().getRoomByName("Dark Forest 2");
            if (f1 == null) return "Dark Forest 2";
            if (f2 == null) return "Dark Forest 1";
            return f1.getUserCount() <= f2.getUserCount() ? "Dark Forest 1" : "Dark Forest 2";
        }
    }

    // ----------------------------------------------------------------
    // Handler: battleResult — notify room that a battle ended
    // Params: { enemy: str, xpGained: int, goldGained: int, won: bool }
    // ----------------------------------------------------------------
    public class BattleResultHandler extends BaseClientRequestHandler {
        @Override
        public void handleClientRequest(User sender, ISFSObject params) {
            boolean won    = params.getBool("won");
            String  enemy  = params.getUtfString("enemy");
            int     xp     = params.getInt("xpGained");

            // Build broadcast payload
            ISFSObject broadcast = SFSObject.newInstance();
            broadcast.putUtfString("player", sender.getName());
            broadcast.putUtfString("enemy",  enemy);
            broadcast.putBool("won", won);
            broadcast.putInt("xpGained", xp);

            // Broadcast to everyone in sender's current room
            Room room = sender.getLastJoinedRoom();
            if (room != null) {
                sendToRoom("battleNews", broadcast, room);
            }
        }
    }

    // ----------------------------------------------------------------
    // Handler: playerState — broadcast lightweight state (HP, level)
    // so other players can see it via extension response
    // Params: { hp: int, maxHp: int, level: int }
    // ----------------------------------------------------------------
    public class PlayerStateHandler extends BaseClientRequestHandler {
        @Override
        public void handleClientRequest(User sender, ISFSObject params) {
            ISFSObject out = SFSObject.newInstance();
            out.putUtfString("player", sender.getName());
            out.putInt("hp",    params.getInt("hp"));
            out.putInt("maxHp", params.getInt("maxHp"));
            out.putInt("level", params.getInt("level"));

            Room room = sender.getLastJoinedRoom();
            if (room != null) {
                sendToRoom("playerState", out, room);
            }
        }
    }

    // ----------------------------------------------------------------
    // Handler: USER_DISCONNECT — clean up player data
    // ----------------------------------------------------------------
    public class UserDisconnectHandler implements ISFSEventHandler {
        @Override
        public void handleServerEvent(SFSEvent event) throws SFSException {
            User user = (User) event.getParameter(SFSEvent.PARAMETER_USER);
            if (user != null) {
                playerZones.remove(user.getName());
                trace("Player disconnected: " + user.getName());
            }
        }
    }
}
