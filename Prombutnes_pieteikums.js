const [users, setUsers] = useState([]);
const [selectedUserId, setSelectedUserId] = useState("");
useEffect(() => {
    async function loadUsers() {
      if (isLocalMode()) {
        setUsers([
          { id: "1", full_name: localDisplayName() }
        ]);
        return;
      }
  
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name");
  
      if (error) {
        console.error(error);
        return;
      }
  
      setUsers(data || []);
    }
  
    loadUsers();
  }, []);
